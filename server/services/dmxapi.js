const axios = require('axios');
const config = require('../config');
const { containsChinese, translateToEnglish } = require('./translator');
const storage = require('./storage');

// 可用模型列表
const MODELS = [
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image (Nano Banana 2 🍌)',
    type: 'image',
    pricing: { type: 'token', inputPrice: 2.19, outputPrice: 219, minCharge: 0.35, unit: '元/M tokens' }
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview (Nano Banana PRO 🍌)',
    type: 'image',
    pricing: { type: 'token', inputPrice: 14.6, outputPrice: 876, minCharge: 0.5, unit: '元/M tokens' }
  },
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image (Nano Banana 🍌)',
    type: 'image',
    pricing: { type: 'token', inputPrice: 2.19, outputPrice: 219, minCharge: 0.35, unit: '元/M tokens' }
  }
];

// 生成配置（gemini-2.5-flash-image 不支持 responseModalities 参数）
function getGenerationConfig(model) {
  if (model.startsWith('gemini-2.5')) {
    return {};
  }
  return { responseModalities: ['IMAGE'] };
}

// 从 API 响应中提取图片
function extractImageFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    return { error: '无法从 API 响应中提取数据' };
  }
  for (const part of parts) {
    if (part?.inlineData?.data) {
      return {
        type: 'base64',
        mimeType: part.inlineData.mimeType || 'image/png',
        data: part.inlineData.data
      };
    }
  }
  const textPart = parts.find(p => p?.text);
  if (textPart) {
    return { error: 'API 返回了文本而非图片: ' + textPart.text.substring(0, 200) };
  }
  return { error: '无法从 API 响应中提取图片数据' };
}

// 计算费用
function calculateCost(model, usage) {
  const modelInfo = MODELS.find(m => m.id === model);
  const inputPrice = modelInfo?.pricing?.inputPrice || 2.19;
  const outputPrice = modelInfo?.pricing?.outputPrice || 219;
  const minCharge = modelInfo?.pricing?.minCharge || 0.35;
  const inputTokens = usage.promptTokenCount || 0;
  const outputTokens = usage.candidatesTokenCount || 0;
  const inputCost = (inputTokens / 1000000) * inputPrice;
  const outputCost = (outputTokens / 1000000) * outputPrice;
  const rawCost = inputCost + outputCost;
  const totalCost = Math.max(rawCost, minCharge);

  let description;
  if (rawCost < minCharge) {
    description = `￥${minCharge}`;
  } else {
    description = `￥${totalCost.toFixed(4)}（输入 ${inputTokens} + 输出 ${outputTokens} tokens）`;
  }

  return {
    type: 'token',
    inputTokens,
    outputTokens,
    totalCost: parseFloat(totalCost.toFixed(4)),
    minCharge,
    description
  };
}

// 清理 API Key 中的不可见字符
function cleanApiKey(key) {
  return (key || '').replace(/[\s\r\n\t\x00-\x1f\x7f-\x9f]+/g, '');
}

// 文生图
async function textToImage(prompt, model, apiKey, userId, customBaseUrl) {
  const cleanKey = cleanApiKey(apiKey);
  const finalPrompt = containsChinese(prompt)
    ? await translateToEnglish(prompt, cleanKey)
    : prompt;

  const baseUrl = customBaseUrl || config.dmxapiBaseUrl;
  const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const response = await axios.post(url, {
    contents: [{ parts: [{ text: finalPrompt }] }],
    generationConfig: getGenerationConfig(model)
  }, {
    headers: { 'x-goog-api-key': cleanKey, 'Content-Type': 'application/json' },
    timeout: config.timeout.textToImage,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  const imageData = extractImageFromResponse(response.data);
  if (imageData.error) throw new Error(imageData.error);

  const usage = response.data?.usageMetadata || {};
  const cost = calculateCost(model, usage);
  const filename = storage.saveImageFile(imageData.data, imageData.mimeType);

  const result = {
    type: 'text-to-image', prompt, model,
    imageFile: filename, status: 'success', usage, cost
  };
  storage.saveHistory(result, userId);
  return { ...result, imageUrl: `/images/${filename}` };
}

// 图生图
async function imageToImage(prompt, model, apiKey, imageBuffer, mimeType, userId, customBaseUrl) {
  const cleanKey = cleanApiKey(apiKey);
  const base64Image = imageBuffer.toString('base64');

  const translatedPrompt = containsChinese(prompt)
    ? await translateToEnglish(prompt, cleanKey)
    : prompt;
  const editInstruction = `Edit this image according to the following instruction. You must return the modified image: ${translatedPrompt}`;

  const baseUrl = customBaseUrl || config.dmxapiBaseUrl;
  const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const response = await axios.post(url, {
    contents: [{
      parts: [
        { text: editInstruction },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }],
    generationConfig: getGenerationConfig(model)
  }, {
    headers: { 'x-goog-api-key': cleanKey, 'Content-Type': 'application/json' },
    timeout: config.timeout.imageToImage,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  const imageData = extractImageFromResponse(response.data);
  if (imageData.error) throw new Error(imageData.error);

  const usage = response.data?.usageMetadata || {};
  const cost = calculateCost(model, usage);
  const filename = storage.saveImageFile(imageData.data, imageData.mimeType);

  const result = {
    type: 'image-to-image', prompt, model,
    imageFile: filename, status: 'success', usage, cost
  };
  storage.saveHistory(result, userId);
  return { ...result, imageUrl: `/images/${filename}` };
}

module.exports = { MODELS, textToImage, imageToImage };

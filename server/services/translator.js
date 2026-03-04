const axios = require('axios');
const config = require('../config');

// 检测是否包含中文
function containsChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

// 翻译模型列表（按优先级排序，依次 fallback）
const TRANSLATION_MODELS = [
  'Hunyuan-MT-7B',
  'GLM-4.5-Flash'
];

// 用单个模型尝试翻译
async function tryTranslate(prompt, apiKey, model, baseUrl) {
  const cleanKey = (apiKey || '').replace(/[\s\r\n\t\x00-\x1f\x7f-\x9f]+/g, '');
  const url = `${baseUrl || config.dmxapiBaseUrl}/v1/chat/completions`;
  const response = await axios.post(url, {
    model,
    messages: [
      { role: 'system', content: 'You are a translator. Translate the following image generation prompt from Chinese to English. Only output the translated prompt, nothing else.' },
      { role: 'user', content: prompt }
    ]
  }, {
    headers: { 'Authorization': `Bearer ${cleanKey}`, 'Content-Type': 'application/json' },
    timeout: config.timeout.translation
  });
  const text = response.data?.choices?.[0]?.message?.content;
  if (text) return text.trim();
  return null;
}

// 翻译中文 prompt 为英文（带 fallback）
// useOwnerKey: true 时使用站长 key（Google API 模式下用户没有 dmxapi key）
async function translateToEnglish(prompt, apiKey, useOwnerKeyOrBaseUrl = false) {
  let translationKey = apiKey;
  let baseUrl = null;
  if (typeof useOwnerKeyOrBaseUrl === 'string' && useOwnerKeyOrBaseUrl.startsWith('http')) {
    baseUrl = useOwnerKeyOrBaseUrl;
  } else if (useOwnerKeyOrBaseUrl === true) {
    translationKey = config.ownerApiKey;
  }
  if (!translationKey) {
    console.error('无可用翻译 key，使用原始 prompt');
    return prompt;
  }
  for (const model of TRANSLATION_MODELS) {
    try {
      const result = await tryTranslate(prompt, translationKey, model, baseUrl);
      if (result) {
        console.log(`翻译(${model}): "${prompt}" → "${result}"`);
        return result;
      }
    } catch (e) {
      console.error(`翻译模型 ${model} 失败: ${e.message}`);
    }
  }
  console.error('所有翻译模型均失败，使用原始 prompt');
  return prompt;
}

module.exports = { containsChinese, translateToEnglish };

import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/literature'
  },
  {
    path: '/literature',
    name: 'Literature',
    component: () => import('@/pages/Literature/index.vue')
  },
  {
    path: '/image-generator',
    name: 'ImageGenerator',
    component: () => import('@/pages/ImageGenerator/index.vue')
  },
  {
    path: '/canvas',
    name: 'Canvas',
    component: () => import('@/pages/Canvas.vue')
  },
  {
    path: '/api-config',
    name: 'ApiConfig',
    component: () => import('@/pages/ApiConfig.vue')
  },
  {
    path: '/wallet',
    name: 'Wallet',
    component: () => import('@/pages/Wallet.vue')
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('@/pages/Help.vue')
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/pages/Admin.vue')
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;

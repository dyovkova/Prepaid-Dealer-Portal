import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  build: {
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        login: resolve(import.meta.dirname, 'login/index.html'),
        register: resolve(import.meta.dirname, 'register/index.html'),
        catalog: resolve(import.meta.dirname, 'catalog/index.html'),
        newOrder: resolve(import.meta.dirname, 'new-order/index.html'),
        myOrders: resolve(import.meta.dirname, 'my-orders/index.html'),
        orderDetails: resolve(import.meta.dirname, 'order-details/index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        adminProducts: resolve(import.meta.dirname, 'admin/products/index.html'),
        adminDealers: resolve(import.meta.dirname, 'admin/dealers/index.html'),
        adminOrders: resolve(import.meta.dirname, 'admin/orders/index.html'),
      },
    },
  },
});

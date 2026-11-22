import { initPage } from '../utils/init-page.js';
import { createOrderList } from '../admin-orders/list.js';
import { createOrderDetails } from '../admin-orders/details.js';

const detail = new URLSearchParams(location.search).has('id');
document.querySelector('#order-list-section').hidden = detail;
document.querySelector('#order-detail-section').hidden = !detail;
const controller = detail ? createOrderDetails() : createOrderList();
void initPage('admin-orders', account => controller.setAccount(account));

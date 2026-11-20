import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/js/dist/collapse';
import '../styles/main.css';
import { renderHeader } from '../components/header.js';
import { renderFooter } from '../components/footer.js';
import { startPageAuth } from '../auth/page-auth.js';

export function initPage(currentPage) {
  document.querySelector('#site-header').innerHTML = renderHeader(currentPage);
  document.querySelector('#site-footer').innerHTML = renderFooter();
  return startPageAuth(currentPage);
}

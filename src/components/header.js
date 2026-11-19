import { navigationItems, navigationLink } from '../utils/navigation.js';

export function renderHeader(currentPage) {
  return `
    <nav class="navbar navbar-expand-lg bg-white" aria-label="Main navigation">
      <div class="container portal-container">
        <a class="navbar-brand" href="/" aria-label="Prepaid Dealer Portal home">
          <span class="brand-mark" aria-hidden="true">P</span>
          <span>Prepaid<span class="brand-subtitle">Dealer Portal</span></span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
          data-bs-target="#main-navigation" aria-controls="main-navigation"
          aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="main-navigation">
          <ul class="navbar-nav mx-lg-auto gap-lg-1">
            ${navigationItems.map((item) => `<li class="nav-item">${navigationLink(item, currentPage)}</li>`).join('')}
          </ul>
          <div class="navbar-nav auth-navigation gap-2">
            ${navigationLink({ id: 'login', href: '/login/', label: 'Log in' }, currentPage)}
            <a class="btn btn-primary btn-sm${currentPage === 'register' ? ' active' : ''}"
              href="/register/"${currentPage === 'register' ? ' aria-current="page"' : ''}>Register</a>
          </div>
        </div>
      </div>
    </nav>
    <div class="preview-banner">
      <div class="container portal-container d-flex flex-wrap align-items-center gap-2">
        <span class="preview-label">Skeleton preview</span>
        <span>Explore the screens. Accounts, ordering, and admin actions are not connected yet.</span>
      </div>
    </div>`;
}

export const navigationItems = [
  { id: 'home', href: '/', label: 'Home' },
  { id: 'catalog', href: '/catalog/', label: 'Catalog' },
  { id: 'new-order', href: '/new-order/', label: 'New order' },
  { id: 'my-orders', href: '/my-orders/', label: 'My orders' },
  { id: 'admin', href: '/admin/', label: 'Admin' },
];

export function navigationLink({ id, href, label }, currentPage) {
  const isCurrent = id === currentPage;
  const isParent = id === 'my-orders' && currentPage === 'order-details';

  return `<a class="nav-link${isCurrent || isParent ? ' active' : ''}" href="${href}"${isCurrent ? ' aria-current="page"' : ''}>${label}</a>`;
}

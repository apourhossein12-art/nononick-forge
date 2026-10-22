export function initRouter(onRoute) {
  const handle = () => {
    const route = (location.hash || '#/files').replace(/^#\/?/, '') || 'files';
    onRoute(route);
  };
  window.addEventListener('hashchange', handle);
  handle();
  return {
    navigate(route) {
      const next = `#/${route}`;
      if (location.hash === next) handle();
      else location.hash = next;
    }
  };
}
 
 

// Utility to resolve media/image URLs consistently across SSR and CSR

export function resolveImageUrl(path) {
  if (!path || typeof path !== 'string') return '';

  // Already absolute or protocol-relative
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) return path;

  // Keep SSR/CSR output identical to avoid hydration mismatch warnings.
  // Relative path also works with Next.js rewrites/proxy in this project.
  return path.startsWith('/') ? path : `/${path}`;
}

export function getProductImage(product) {
  if (!product) return '';
  const src =
    product.image_url ||
    product.img_url ||
    product.image ||
    product.imgPath ||
    product.img_path ||
    '';
  return resolveImageUrl(src);
}

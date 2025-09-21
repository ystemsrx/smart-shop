import { StaffPortal } from '../admin';

export default function AgentProductsPage() {
  return (
    <StaffPortal
      role="agent"
      navActive="products-agent"
      initialTab="products"
    />
  );
}

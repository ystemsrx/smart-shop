import { StaffPortal } from '../admin';

export default function AgentOrdersPage() {
  return (
    <StaffPortal
      role="agent"
      navActive="orders-agent"
      initialTab="orders"
    />
  );
}

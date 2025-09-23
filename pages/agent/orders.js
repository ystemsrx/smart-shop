import { StaffPortal } from '../admin';

export default function AgentOrdersPage() {
  return (
    <StaffPortal
      role="agent"
      navActive="staff-backend"
      initialTab="orders"
    />
  );
}

import { StaffDashboard } from '../admin/dashboard';

export default function AgentDashboardPage() {
  return (
    <StaffDashboard
      role="agent"
      navActive="dashboard"
      viewAllOrdersHref="/agent/orders"
    />
  );
}

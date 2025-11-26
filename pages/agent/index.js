import { StaffPortal } from '../admin';

export default function AgentPortalHome() {
  return (
    <StaffPortal
      role="agent"
      navActive="staff-backend"
      initialTab="overview"
    />
  );
}

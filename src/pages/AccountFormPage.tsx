// src/pages/AccountFormPage.tsx

import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { AccountForm } from '../features/accounts/AccountForm';
import { useAccounts } from '../hooks/useAccounts';

export default function AccountFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('gameId') ? parseInt(searchParams.get('gameId')!, 10) : undefined;
  const { accounts } = useAccounts();
  
  // Get account data from location.state (passed from AccountList)
  const stateAccount = (location.state as any)?.account;
  
  // Determine if we are in edit mode or create mode
  const isEditMode = location.pathname.includes('/edit/');
  
  // Get account data if we're in edit mode
  const accountId = id ? parseInt(id, 10) : undefined;
  // Use account from state if available, otherwise find it in accounts
  const account = isEditMode && accountId ? (stateAccount || accounts.find(a => a.id === accountId)) : undefined;

  const handleClose = () => {
    navigate('/accounts');
  };

  return <AccountForm account={account} accountId={accountId} gameId={gameId} onClose={handleClose} />;
}

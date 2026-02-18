import type { SellerMe } from '../../../api/sellerClient';

export interface SettingsTabProps {
  me: SellerMe;
  reload: () => Promise<void>;
}

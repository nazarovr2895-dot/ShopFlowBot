import { LegalOfferContent } from './LegalContent';
import './LegalSettingsTab.css';

export function LegalSettingsTab() {
  return (
    <div className="legal-tab">
      <div className="legal-tab__document">
        <LegalOfferContent />
      </div>
    </div>
  );
}

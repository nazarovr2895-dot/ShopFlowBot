import { useState } from 'react';
import { getOrgData, type InnData } from '../../api/adminClient';
import { OrgDataDisplay } from '../../components/OrgDataDisplay';
import { Modal } from './sellerUtils';

interface InnVerificationModalProps {
  onClose: () => void;
  onNext: (identifier: string, innData: InnData) => void;
}

export function InnVerificationModal({ onClose, onNext }: InnVerificationModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [loading, setLoading] = useState(false);
  const [orgData, setOrgData] = useState<InnData | null>(null);
  const [error, setError] = useState('');

  const validateIdentifier = (value: string): string => {
    if (!value.trim()) return '';
    const clean = value.trim().replace(/\s/g, '');
    if (!/^\d+$/.test(clean)) {
      return 'Должен содержать только цифры';
    }
    if (![10, 12, 13, 15].includes(clean.length)) {
      return 'ИНН (10/12 цифр) или ОГРН (13/15 цифр)';
    }
    return '';
  };

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    setIdentifierError(validateIdentifier(value));
    setOrgData(null);
    setError('');
  };

  const handleGetData = async () => {
    setError('');
    const validationError = validateIdentifier(identifier);
    if (validationError) {
      setIdentifierError(validationError);
      return;
    }
    setIdentifierError('');
    setLoading(true);
    try {
      const clean = identifier.trim().replace(/\s/g, '');
      const data = await getOrgData(clean);
      setOrgData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при получении данных');
      setOrgData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (!orgData) {
      setError('Сначала получите данные по ИНН/ОГРН');
      return;
    }
    onNext(identifier.trim().replace(/\s/g, ''), orgData);
  };

  return (
    <Modal title="Проверка ИНН / ОГРН" onClose={onClose}>
      <div>
        <div className="form-group">
          <label className="form-label">ИНН или ОГРН *</label>
          <input
            type="text"
            className={`form-input ${identifierError ? 'error' : ''}`}
            value={identifier}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder="ИНН (10/12 цифр) или ОГРН (13/15 цифр)"
            maxLength={15}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleGetData()}
          />
          {identifierError && <div className="form-error">{identifierError}</div>}
          <small className="form-hint">Введите ИНН (10/12 цифр) или ОГРН/ОГРНИП (13/15 цифр)</small>
        </div>

        <div className="modal-actions modal-actions--spaced">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGetData}
            disabled={loading || !!identifierError || !identifier.trim()}
          >
            {loading ? 'Загрузка...' : 'Получить данные'}
          </button>
        </div>

        {error && <div className="modal-error modal-error--spaced">{error}</div>}

        {orgData && (
          <div className="org-data-section">
            <OrgDataDisplay data={orgData} showFullOkvedDescriptions={true} />
          </div>
        )}

        <div className="modal-actions modal-actions--section">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!orgData}
          >
            Далее
          </button>
        </div>
      </div>
    </Modal>
  );
}

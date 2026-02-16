import React from 'react';
import type { InnData } from '../api/adminClient';

function formatISODate(isoDate: string | undefined): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return isoDate;
  }
}

interface OrgDataDisplayProps {
  data: InnData;
  showFullOkvedDescriptions?: boolean;
}

export const OrgDataDisplay: React.FC<OrgDataDisplayProps> = ({ data, showFullOkvedDescriptions = true }) => {
  return (
    <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
      <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#0070e0' }}>Данные организации</h4>
      <div className="seller-info-grid">
        <div className="info-row">
          <span className="info-label">Название</span>
          <span className="info-value" style={{ color: '#0070e0' }}>{data.name}</span>
        </div>
        {data.short_name && (
          <div className="info-row">
            <span className="info-label">Краткое название</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{data.short_name}</span>
          </div>
        )}
        {data.ogrn && (
          <div className="info-row">
            <span className="info-label">ОГРН</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{data.ogrn}</span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">ИНН</span>
          <span className="info-value" style={{ color: '#0070e0' }}>{data.inn}</span>
        </div>
        {data.kpp && (
          <div className="info-row">
            <span className="info-label">КПП</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{data.kpp}</span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Тип</span>
          <span className="info-value" style={{ color: '#0070e0' }}>
            {data.type === 'LEGAL' ? 'Юридическое лицо' : 'Индивидуальный предприниматель'}
          </span>
        </div>
        {data.address && (
          <div className="info-row">
            <span className="info-label">Адрес</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{data.address}</span>
          </div>
        )}
        {data.management && (
          <div className="info-row">
            <span className="info-label">Руководитель</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{data.management}</span>
          </div>
        )}
        {data.registration_date && (
          <div className="info-row">
            <span className="info-label">Дата регистрации</span>
            <span className="info-value" style={{ color: '#0070e0' }}>{formatISODate(data.registration_date)}</span>
          </div>
        )}
        {data.okved && (
          <div className="info-row">
            <span className="info-label">ОКВЭД {data.okved_type ? `(${data.okved_type})` : ''}</span>
            <span className="info-value" style={{ color: '#0070e0' }}>
              <strong>{data.okved}</strong>
              {data.okveds && data.okveds.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.9em', color: '#0070e0', opacity: 0.8 }}>
                  Дополнительные: {data.okveds.join(', ')}
                </div>
              )}
            </span>
          </div>
        )}
        {data.okved_match && (
          <div className="info-row">
            <span className="info-label">Соответствие ОКВЭД</span>
            <span className="info-value" style={{ color: '#0070e0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: data.okved_match.matches_47_76 ? '#28a745' : '#dc3545'
                  }}></span>
                  <span style={{ color: '#0070e0' }}>
                    {showFullOkvedDescriptions
                      ? '47.76 (Торговля розничная цветами и другими растениями, семенами и удобрениями в специализированных магазинах)'
                      : '47.76'}
                  </span>
                  {data.okved_match.matches_47_76 && (
                    <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>Совпадает</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: data.okved_match.matches_47_91 ? '#28a745' : '#dc3545'
                  }}></span>
                  <span style={{ color: '#0070e0' }}>
                    {showFullOkvedDescriptions
                      ? '47.91 (Торговля розничная по почте или по информационно-коммуникационной сети Интернет)'
                      : '47.91'}
                  </span>
                  {data.okved_match.matches_47_91 && (
                    <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>Совпадает</span>
                  )}
                </div>
              </div>
            </span>
          </div>
        )}
        <div className="info-row">
          <span className="info-label">Статус</span>
          <span className="info-value">
            <span className="badge badge-success">Активна</span>
          </span>
        </div>
      </div>
    </div>
  );
};

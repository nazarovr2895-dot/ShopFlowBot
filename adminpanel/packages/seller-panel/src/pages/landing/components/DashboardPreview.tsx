/**
 * CSS-арт стилизованного дашборда продавца.
 * Используется как иллюстрация в секции "Возможности".
 */
export function DashboardPreview() {
  return (
    <div className="dash-preview">
      {/* Sidebar */}
      <div className="dash-preview__sidebar">
        <div className="dash-preview__logo-dot" />
        <div className="dash-preview__nav-item dash-preview__nav-item--active" />
        <div className="dash-preview__nav-item" />
        <div className="dash-preview__nav-item" />
        <div className="dash-preview__nav-item" />
        <div className="dash-preview__nav-item" />
      </div>

      {/* Main content */}
      <div className="dash-preview__main">
        {/* Stats row */}
        <div className="dash-preview__stats">
          <div className="dash-preview__stat-card">
            <div className="dash-preview__stat-label" />
            <div className="dash-preview__stat-value" style={{ width: '60%' }} />
          </div>
          <div className="dash-preview__stat-card">
            <div className="dash-preview__stat-label" />
            <div className="dash-preview__stat-value" style={{ width: '45%' }} />
          </div>
          <div className="dash-preview__stat-card">
            <div className="dash-preview__stat-label" />
            <div className="dash-preview__stat-value" style={{ width: '55%' }} />
          </div>
        </div>

        {/* Chart */}
        <div className="dash-preview__chart">
          <svg viewBox="0 0 300 80" className="dash-preview__chart-svg">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 60 Q30 55 60 45 Q90 30 120 35 Q150 40 180 20 Q210 10 240 15 Q270 20 300 5 L300 80 L0 80Z"
              fill="url(#chartGrad)"
            />
            <path
              d="M0 60 Q30 55 60 45 Q90 30 120 35 Q150 40 180 20 Q210 10 240 15 Q270 20 300 5"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Table */}
        <div className="dash-preview__table">
          {[0.85, 0.7, 0.9, 0.6].map((w, i) => (
            <div key={i} className="dash-preview__table-row">
              <div className="dash-preview__table-cell" style={{ width: '10%' }} />
              <div className="dash-preview__table-cell" style={{ width: `${w * 40}%` }} />
              <div className="dash-preview__table-cell dash-preview__table-cell--accent" style={{ width: '15%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

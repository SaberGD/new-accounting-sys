import React from 'react';

interface BrandedLoaderProps {
  status?: string;
}

const BrandedLoader: React.FC<BrandedLoaderProps> = ({ status = 'Preparing your financial workspace' }) => (
  <div className="sg-accounting-loader" role="status" aria-live="polite">
    <div className="sg-accounting-loader-grid" aria-hidden="true" />
    <div className="sg-accounting-loader-content">
      <div className="sg-accounting-loader-mark">
        <span className="sg-accounting-loader-orbit" aria-hidden="true" />
        <img src="/saber-group-logo.png" alt="Saber Group" />
      </div>
      <p>FINANCIAL OPERATIONS SYSTEM</p>
      <div className="sg-accounting-loader-line" aria-hidden="true"><span /></div>
      <small>{status}</small>
    </div>
  </div>
);

export default BrandedLoader;

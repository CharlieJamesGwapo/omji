import React from 'react';
import { STATUS_COLORS, DEFAULT_STATUS_COLOR } from '../constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text} ${className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;

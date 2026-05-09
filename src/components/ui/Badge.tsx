import React from 'react';
import { cn } from '../../lib/utils';
import { STATUS_CLS, STATUS_LBL } from '../../lib/constants';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className, ...props }) => {
  const cls = STATUS_CLS[status] || '';
  const lbl = STATUS_LBL[status] || status;
  
  return (
    <span className={cn('badge', cls, className)} {...props}>
      {lbl}
    </span>
  );
};

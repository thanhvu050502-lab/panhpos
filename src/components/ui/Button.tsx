import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'brand' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'icon' | 'full';
}

export const Button: React.FC<ButtonProps> = ({ 
  variant, 
  size, 
  className, 
  children, 
  ...props 
}) => {
  return (
    <button 
      className={cn('btn', variant, size, className)} 
      {...props}
    >
      {children}
    </button>
  );
};

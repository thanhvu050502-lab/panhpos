import React from 'react';
import { avColor, initials } from '../../lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ 
  name, 
  size = 38, 
  style, 
  className, 
  ...props 
}) => {
  const [bg, fg] = avColor(name);
  const fontSize = size < 36 ? 11 : 13;
  
  return (
    <div 
      className={`av ${className || ''}`}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: fontSize,
        fontWeight: 700,
        flexShrink: 0,
        ...style
      }}
      {...props}
    >
      {initials(name)}
    </div>
  );
};

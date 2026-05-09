import React from 'react';

interface FABProps {
  currentScreen: string;
  onClick: () => void;
}

export const FAB: React.FC<FABProps> = ({ currentScreen, onClick }) => {
  // In original app, Settings didn't trigger the FAB.
  // We hide or return null here depending on the screen if needed.
  if (currentScreen === 'settings') return null;

  return (
    <button className="fab" id="fabBtn" onClick={onClick}>
      +
    </button>
  );
};

import { createContext, useContext } from 'react';

// Mengalirkan spaceId dari SpaceGate ke halaman konten (layout-route pattern).
const SpaceContext = createContext(null);

export function SpaceProvider({ spaceId, children }) {
  return <SpaceContext.Provider value={spaceId}>{children}</SpaceContext.Provider>;
}

export function useSpaceId() {
  return useContext(SpaceContext);
}
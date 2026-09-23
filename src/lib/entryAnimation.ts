import { createContext, useContext } from 'react';

/**
 * Whether content inside a chat message should play its entry animation. Messages restored
 * from the server (switching chats, reloads) render at once; only new ones animate.
 */
export const EntryAnimationContext = createContext(true);

export const useEntryAnimation = () => useContext(EntryAnimationContext);

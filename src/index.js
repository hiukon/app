// Screens
export { default as HomeScreen } from './views/screens/HomeScreen';
export { default as ExploreScreen } from './views/screens/ExploreScreen';
export { default as InfoScreen } from './views/screens/InfoScreen';
export { default as AccountScreen } from './views/screens/AccountScreen';

// Components
export { default as StatCard } from './views/components/statistics/StatCard';
export { default as DraggableChatBubble } from './views/components/chat/DraggableChatBubble';
export { default as LoadingSpinner } from './views/components/common/LoadingSpinner';
export { default as ErrorBoundary } from './views/components/common/ErrorBoundary';

// Hooks
export { useStatistics } from './hooks/useStatistics';
export { useChat } from './hooks/useChat';
export { useAuth } from './contexts/AuthContext';
export { useResponsive } from './hooks/useResponsive';

// Utils
export { formatNumber, formatDate } from './utils/formatters';
export { validateEmail, validatePhone } from './utils/validators';
export { scaleWidth, scaleHeight, scaleFont } from './utils/responsive';
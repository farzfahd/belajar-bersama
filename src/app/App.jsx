import { ThemeProvider } from './providers';
import { ToastProvider } from '../shared/components/ToastProvider';
import AppRoutes from './router';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </ThemeProvider>
  );
}
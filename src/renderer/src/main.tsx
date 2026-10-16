import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CustomerDisplay } from './components/CustomerDisplay';
import './styles.css';

// نفس الواجهة بتنفتح بنافذة شاشة الزبون (#customer) بس بتعرض شاشة العرض لحالها
createRoot(document.getElementById('root')!).render(location.hash === '#customer' ? <CustomerDisplay /> : <App />);

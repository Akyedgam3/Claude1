import { useState } from 'react';
import { IS_MOBILE } from '../api';
import { Icon } from './icons';

// نقطة البيع والمطعم على الجوال: تبويب للمواد وتبويب للسلة، وشريط تحت فيه المجموع بيفتح السلة.

export type CartTab = 'items' | 'cart';

export function useCartTab() {
  const [tab, setTab] = useState<CartTab>('items');
  return { tab, setTab, className: IS_MOBILE ? `m-${tab}` : '' };
}

export function CartTabs({ tab, setTab, count, itemsLabel = 'المواد' }: { tab: CartTab; setTab: (t: CartTab) => void; count: number; itemsLabel?: string }) {
  if (!IS_MOBILE) return null;
  return (
    <div className="m-cart-tabs segmented">
      <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
        <Icon name="package" size={16} /> {itemsLabel}
      </button>
      <button className={tab === 'cart' ? 'active' : ''} onClick={() => setTab('cart')}>
        <Icon name="receipt" size={16} /> السلة {count > 0 && <span className="m-count">{count}</span>}
      </button>
    </div>
  );
}

export function CartBar({ tab, setTab, count, total }: { tab: CartTab; setTab: (t: CartTab) => void; count: number; total: string }) {
  if (!IS_MOBILE || tab !== 'items' || count === 0) return null;
  return (
    <button className="m-cart-bar primary" onClick={() => setTab('cart')}>
      <span className="m-count">{count}</span>
      <span>عرض السلة والدفع</span>
      <strong>{total}</strong>
    </button>
  );
}

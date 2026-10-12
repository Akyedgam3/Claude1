import { Component, type ReactNode } from 'react';

/** يمنع تحوّل الشاشة إلى بيضاء عند خطأ غير متوقع في شاشة واحدة؛ باقي البرنامج يبقى يعمل. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  override state = { error: null as Error | null, key: '' };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    // الانتقال لشاشة أخرى يمسح الخطأ
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error) {
    console.error('screen crashed', error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card crash">
          <h3>حدث خطأ غير متوقع في هذه الشاشة</h3>
          <p className="muted">بياناتك محفوظة ولم يتأثر شيء. جرّب فتح الشاشة من جديد، وإن تكرر الخطأ أرسل الرسالة التالية للدعم الفني.</p>
          <pre className="mono selectable">{this.state.error.message}</pre>
          <button className="primary" onClick={() => this.setState({ error: null })}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }
}

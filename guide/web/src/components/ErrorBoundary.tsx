import { Component, type ReactNode } from 'react';
import { IconAlertCircle, IconRefresh } from './Icons';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <IconAlertCircle size={48} className="text-destructive mx-auto mb-4" />
            <h1 className="text-[18px] font-medium mb-2">页面出错了</h1>
            <p className="text-[14px] text-muted-foreground mb-4">{this.state.error?.message}</p>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-md hover:opacity-90 text-[14px] flex items-center gap-1.5 mx-auto">
              <IconRefresh size={16} /> 刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

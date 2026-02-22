import type { PermissionRequest } from '../types';

interface Props {
  request: PermissionRequest;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ request, onAllow, onDeny }: Props) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ background: 'rgba(251,191,36,0.1)' }}
          >
            ⚡
          </div>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Permission Required
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Agent wants to use a tool
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <div
            className="font-medium mb-2"
            style={{ color: 'var(--text-primary)', fontSize: 15 }}
          >
            {request.toolCall?.title || 'Tool Call'}
          </div>
          {request.toolCall?.description && (
            <div className="mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {request.toolCall.description}
            </div>
          )}
          {request.toolCall?.input != null && (
            <div
              className="rounded-lg p-3 text-xs overflow-auto"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                maxHeight: 200,
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
              }}
            >
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(request.toolCall.input as Record<string, unknown>, null, 2)}
              </pre>
            </div>
          )}
          {request.options && request.options.length > 0 && (
            <div className="mt-3 space-y-2">
              {request.options.map((opt, i) => (
                <div key={i} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  • {opt.title}
                  {opt.description && (
                    <span style={{ color: 'var(--text-muted)' }}> — {opt.description}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="px-5 py-4 flex gap-3 justify-end"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onDeny}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'var(--bg-tertiary)';
            }}
          >
            Deny
          </button>
          <button
            onClick={onAllow}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              border: 'none',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = 'var(--accent)';
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

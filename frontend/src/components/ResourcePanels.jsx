/**
 * ResourcePanels.jsx
 * ──────────────────
 * In-app resource interaction panels, one per AWS resource type.
 * Uses the named API exports from ../services/api (already defined).
 *
 * Exported:
 *   <ResourcePanel ticket={ticket} />   — auto-selects by template_type
 *   Individual panels are also exported for direct use if needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listS3Objects, deleteS3Object, getS3DownloadUrl, getS3UploadUrl,
  scanDynamoDB, putDynamoItem, deleteDynamoItem,
  listEcrImages, getRdsConnection, getEc2SshInfo,
} from '../services/api'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:        '#185FA5',
  blueBg:      '#D6E9FB',
  blueBorder:  '#A8C8F0',
  green:       '#27500A',
  greenBg:     '#D4EDB8',
  greenBorder: '#A8D98A',
  amber:       '#633806',
  amberBg:     '#FAEEDA',
  amberBorder: '#D4A84B',
  red:         '#791F1F',
  redBg:       '#FCEBEB',
  redBorder:   '#F5C6C6',
  mono:        'DM Mono, ui-monospace, monospace',
}

const labelStyle = {
  fontSize: 10, fontWeight: 600, color: '#AAA',
  letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4,
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Panel({ children }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E8E8E8',
      borderRadius: 8, padding: '16px', marginTop: 12,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  )
}

function Spinner({ size = 13 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid #E0E0E0', borderTopColor: C.blue,
      animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

function ErrorBar({ msg, onRetry }) {
  return (
    <div style={{
      background: C.redBg, border: `0.5px solid ${C.redBorder}`,
      borderRadius: 6, padding: '9px 12px', fontSize: 12, color: C.red,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span>⚠ {msg}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          Retry
        </button>
      )}
    </div>
  )
}

function InfoNote({ children, color = C.amber, bg = C.amberBg, border = C.amberBorder }) {
  return (
    <div style={{
      fontSize: 11, color, background: bg, border: `0.5px solid ${border}`,
      borderRadius: 5, padding: '7px 10px', marginBottom: 10, lineHeight: 1.6,
    }}>
      {children}
    </div>
  )
}

function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false)
  const doCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={doCopy} style={{
      fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      cursor: 'pointer', flexShrink: 0,
      background: copied ? C.greenBg : '#F0F0F0',
      color:      copied ? C.green   : '#888',
      border:     `0.5px solid ${copied ? C.greenBorder : '#DDD'}`,
      transition: 'all 0.15s',
    }}>
      {copied ? '✓ copied' : 'copy'}
    </button>
  )
}

function FieldRow({ label, value, mono = true }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
        <span style={{
          fontSize: 11, color: '#111', wordBreak: 'break-all', flex: 1, lineHeight: 1.5,
          fontFamily: mono ? C.mono : 'inherit',
        }}>{value}</span>
        <CopyBtn value={value} />
      </div>
    </div>
  )
}

function CodeBlock({ label, code }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <div style={labelStyle}>{label}</div>}
      <div style={{ position: 'relative', background: '#F4F4F4', border: '0.5px solid #E0E0E0', borderRadius: 6, padding: '10px 40px 10px 12px', marginTop: 4 }}>
        <pre style={{ fontFamily: C.mono, fontSize: 10, color: '#111', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{code}</pre>
        <div style={{ position: 'absolute', top: 6, right: 6 }}><CopyBtn value={code} /></div>
      </div>
    </div>
  )
}

function SmallBtn({ onClick, disabled, bg, color, border, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: bg, color, border: `0.5px solid ${border}`,
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// S3 File Manager
// ═══════════════════════════════════════════════════════════════════════════════

function formatBytes(b) {
  if (!b) return '0 B'
  const k = 1024, u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${u[i]}`
}

export function S3FileManager({ ticket }) {
  const [prefix, setPrefix]           = useState('')
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [deleting, setDeleting]       = useState(null)
  const [confirmDel, setConfirmDel]   = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadMsg, setUploadMsg]     = useState(null)
  const [nextToken, setNextToken]     = useState(null)
  const fileRef                       = useRef()

  const load = useCallback(async (pfx, token = null) => {
    setLoading(true); setError(null)
    try {
      const res = await listS3Objects(ticket.id, pfx, token)
      setData(prev =>
        token
          ? { ...res.data, files: [...(prev?.files || []), ...res.data.files] }
          : res.data
      )
      setNextToken(res.data.next_token || null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to list bucket')
    } finally { setLoading(false) }
  }, [ticket.id])

  useEffect(() => { setNextToken(null); load(prefix) }, [prefix])

  const goFolder = (pfx) => { setPrefix(pfx); setNextToken(null) }

  // Breadcrumb segments
  const crumbs = ['root', ...prefix.split('/').filter(Boolean)]

  const handleDelete = async (key) => {
    setDeleting(key)
    try {
      await deleteS3Object(ticket.id, key)
      setData(prev => ({ ...prev, files: prev.files.filter(f => f.key !== key) }))
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed')
    } finally { setDeleting(null); setConfirmDel(null) }
  }

  const handleDownload = async (key) => {
    try {
      const res = await getS3DownloadUrl(ticket.id, key)
      window.open(res.data.download_url, '_blank')
    } catch { setError('Could not generate download link') }
  }

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true); setUploadMsg(null)
    const ext = file.name.split('.').pop().toLowerCase()
    const mime = { html:'text/html', css:'text/css', js:'application/javascript', json:'application/json', txt:'text/plain', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', pdf:'application/pdf' }
    const ct = mime[ext] || 'application/octet-stream'
    try {
      const res = await getS3UploadUrl(ticket.id, file.name, prefix, ct)
      const up = await fetch(res.data.upload_url, { method: 'PUT', body: file, mode: 'cors', headers: { 'Content-Type': ct } })
      if (up.ok) {
        setUploadMsg({ ok: true, text: `✓ ${file.name} uploaded` })
        load(prefix)
      } else {
        const body = await up.text().catch(() => '')
        const detail = body.match(/<Message>(.+?)<\/Message>/)?.[1] || `HTTP ${up.status}`
        setUploadMsg({ ok: false, text: `Upload failed: ${detail}` })
      }
    } catch (e) {
      setUploadMsg({ ok: false, text: e.response?.data?.detail || 'Upload failed' })
    } finally { setUploading(false) }
  }

  const isStatic = (ticket.template_type || ticket.template?.template_type) === 's3_static_site'

  return (
    <Panel>
      <SectionHeader
        icon="🗂"
        title="File Manager"
        subtitle={data?.bucket ? `Bucket: ${data.bucket}` : 'S3'}
        action={
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: uploading ? '#F0F0F0' : C.blueBg,
              color:      uploading ? '#AAA'    : C.blue,
              border:     `0.5px solid ${uploading ? '#DDD' : C.blueBorder}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {uploading ? <><Spinner size={11} /> Uploading…</> : '↑ Upload'}
          </button>
        }
      />

      <input type="file" ref={fileRef} style={{ display: 'none' }}
        onChange={e => { handleUpload(e.target.files[0]); e.target.value = '' }} />

      {uploadMsg && (
        <div style={{
          fontSize: 11, padding: '6px 10px', borderRadius: 5, marginBottom: 10,
          background: uploadMsg.ok ? C.greenBg  : C.redBg,
          color:      uploadMsg.ok ? C.green    : C.red,
          border:     `0.5px solid ${uploadMsg.ok ? C.greenBorder : C.redBorder}`,
        }}>{uploadMsg.text}</div>
      )}

      {isStatic && (
        <InfoNote>📋 Static site bucket — upload <code>index.html</code> to update your site.</InfoNote>
      )}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          const target = i === 0 ? '' : crumbs.slice(1, i + 1).join('/') + '/'
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {i > 0 && <span style={{ color: '#CCC', fontSize: 10 }}>/</span>}
              <button
                onClick={() => !isLast && goFolder(target)}
                disabled={isLast}
                style={{
                  fontSize: 11, background: 'none', border: 'none', padding: 0,
                  cursor: isLast ? 'default' : 'pointer',
                  color:  isLast ? '#111' : C.blue,
                  fontWeight: isLast ? 600 : 400,
                }}
              >{crumb}</button>
            </span>
          )
        })}
      </div>

      {/* Loading / error */}
      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888', fontSize: 12 }}>
          <Spinner /> Loading…
        </div>
      )}
      {error && <ErrorBar msg={error} onRetry={() => load(prefix)} />}

      {/* Folders */}
      {(data?.folders || []).map(folder => (
        <div
          key={folder}
          onClick={() => goFolder(folder)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
            marginBottom: 3, background: '#FAFAFA', border: '0.5px solid #F0F0F0',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#F0F0F0'}
          onMouseLeave={e => e.currentTarget.style.background = '#FAFAFA'}
        >
          <span style={{ fontSize: 14 }}>📁</span>
          <span style={{ fontSize: 12, color: '#333', flex: 1 }}>
            {folder.slice(prefix.length).replace('/', '')}
          </span>
          <span style={{ fontSize: 11, color: '#BBB' }}>›</span>
        </div>
      ))}

      {/* Files */}
      {(data?.files || []).map(file => (
        <div key={file.key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 6, marginBottom: 3,
          background: '#fff', border: '0.5px solid #F0F0F0',
        }}>
          <span style={{ fontSize: 13 }}>📄</span>
          <span style={{ fontSize: 11, color: '#111', flex: 1, wordBreak: 'break-all', fontFamily: C.mono }}>
            {file.name}
          </span>
          <span style={{ fontSize: 10, color: '#AAA', whiteSpace: 'nowrap', marginRight: 4 }}>
            {formatBytes(file.size)}
          </span>
          <SmallBtn onClick={() => handleDownload(file.key)} bg={C.blueBg} color={C.blue} border={C.blueBorder}>↓</SmallBtn>
          {confirmDel === file.key ? (
            <>
              <SmallBtn onClick={() => handleDelete(file.key)} disabled={deleting === file.key} bg={C.redBg} color={C.red} border={C.redBorder}>
                {deleting === file.key ? '…' : 'confirm'}
              </SmallBtn>
              <SmallBtn onClick={() => setConfirmDel(null)} bg="#F0F0F0" color="#666" border="#DDD">✕</SmallBtn>
            </>
          ) : (
            <SmallBtn onClick={() => setConfirmDel(file.key)} bg="#F0F0F0" color="#999" border="#E0E0E0">🗑</SmallBtn>
          )}
        </div>
      ))}

      {/* Empty state */}
      {!loading && data && data.files.length === 0 && data.folders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#CCC', fontSize: 12 }}>
          {prefix ? 'Empty folder' : 'Bucket is empty — upload a file to get started'}
        </div>
      )}

      {/* Load more */}
      {nextToken && (
        <button
          onClick={() => load(prefix, nextToken)}
          disabled={loading}
          style={{
            width: '100%', marginTop: 8, fontSize: 11,
            color: C.blue, background: C.blueBg,
            border: `0.5px solid ${C.blueBorder}`,
            borderRadius: 6, padding: '6px', cursor: 'pointer',
          }}
        >{loading ? 'Loading…' : 'Load more'}</button>
      )}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DynamoDB Browser
// ═══════════════════════════════════════════════════════════════════════════════

function ItemModal({ item, ticketId, onDone, onClose }) {
  const isNew = item === null
  const [json, setJson]     = useState(isNew ? '{\n  "id": ""\n}' : JSON.stringify(item, null, 2))
  const [err, setErr]       = useState(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    let parsed
    try { parsed = JSON.parse(json) } catch { setErr('Invalid JSON'); return }
    if (!parsed.id || !String(parsed.id).trim()) { setErr('"id" field is required (partition key)'); return }
    setSaving(true); setErr(null)
    try {
      await putDynamoItem(ticketId, parsed)
      onDone()
      onClose()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{isNew ? 'New item' : 'Edit item'}</div>
        <div style={labelStyle}>"id" is the partition key (required)</div>
        <textarea
          value={json}
          onChange={e => setJson(e.target.value)}
          rows={10}
          style={{
            width: '100%', fontFamily: C.mono, fontSize: 11, padding: 10,
            borderRadius: 6, border: '1px solid #DDD', resize: 'vertical',
            marginTop: 4, boxSizing: 'border-box', lineHeight: 1.6,
          }}
        />
        {err && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <SmallBtn onClick={onClose} bg="#F0F0F0" color="#666" border="#DDD">
            <span style={{ padding: '4px 6px', display: 'inline-block' }}>Cancel</span>
          </SmallBtn>
          <SmallBtn onClick={handleSave} disabled={saving} bg={C.blueBg} color={C.blue} border={C.blueBorder}>
            <span style={{ padding: '4px 6px', display: 'inline-block' }}>{saving ? 'Saving…' : 'Save item'}</span>
          </SmallBtn>
        </div>
      </div>
    </div>
  )
}

export function DynamoDBBrowser({ ticket }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastKey, setLastKey]     = useState(null)
  const [modal, setModal]         = useState(undefined) // undefined=closed, null=new, obj=edit
  const [confirmId, setConfirmId] = useState(null)
  const [deleting, setDeleting]   = useState(null)

  const load = useCallback(async (append = false) => {
    setLoading(true); setError(null)
    try {
      const res = await scanDynamoDB(ticket.id, 25, append ? lastKey : null)
      setData(prev =>
        append && prev
          ? { ...res.data, items: [...prev.items, ...res.data.items] }
          : res.data
      )
      setLastKey(res.data.next_key || null)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to scan table')
    } finally { setLoading(false) }
  }, [ticket.id, lastKey])

  useEffect(() => { load(false) }, [ticket.id])

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      await deleteDynamoItem(ticket.id, id)
      setData(prev => ({ ...prev, items: prev.items.filter(i => String(i.id) !== String(id)) }))
    } catch (e) {
      setError(e.response?.data?.detail || 'Delete failed')
    } finally { setDeleting(null); setConfirmId(null) }
  }

  const items   = data?.items   || []
  const columns = data?.columns || []
  const visibleCols = ['id', ...columns.filter(c => c !== 'id')].slice(0, 5)

  return (
    <Panel>
      <SectionHeader
        icon="⚡"
        title="DynamoDB Browser"
        subtitle={data?.table_name ? `Table: ${data.table_name}` : 'DynamoDB'}
        action={
          <button
            onClick={() => setModal(null)}
            style={{
              fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
              cursor: 'pointer', background: C.blueBg, color: C.blue, border: `0.5px solid ${C.blueBorder}`,
            }}
          >+ New item</button>
        }
      />

      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888', fontSize: 12 }}>
          <Spinner /> Loading…
        </div>
      )}
      {error && <ErrorBar msg={error} onRetry={() => load(false)} />}

      {data && items.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#CCC', fontSize: 12 }}>
          Table is empty — create your first item
        </div>
      )}

      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F0F0F0' }}>
                {visibleCols.map(col => (
                  <th key={col} style={{
                    textAlign: 'left', padding: '5px 8px',
                    color: '#AAA', fontWeight: 600, fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  }}>{col}</th>
                ))}
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}
                  style={{ borderBottom: '0.5px solid #F8F8F8' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  {visibleCols.map(col => (
                    <td key={col} style={{
                      padding: '6px 8px', fontFamily: C.mono, color: '#333',
                      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item[col] != null ? String(item[col]) : <span style={{ color: '#DDD' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <SmallBtn onClick={() => setModal(item)} bg={C.blueBg} color={C.blue} border={C.blueBorder}>edit</SmallBtn>
                      {confirmId === String(item.id) ? (
                        <>
                          <SmallBtn onClick={() => handleDelete(String(item.id))} disabled={deleting === String(item.id)} bg={C.redBg} color={C.red} border={C.redBorder}>
                            {deleting === String(item.id) ? '…' : 'confirm'}
                          </SmallBtn>
                          <SmallBtn onClick={() => setConfirmId(null)} bg="#F0F0F0" color="#666" border="#DDD">✕</SmallBtn>
                        </>
                      ) : (
                        <SmallBtn onClick={() => setConfirmId(String(item.id))} bg="#F0F0F0" color="#999" border="#E0E0E0">🗑</SmallBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <span style={{ fontSize: 10, color: '#AAA' }}>
          {data ? `${items.length} items loaded` : ''}
        </span>
        {lastKey && (
          <button
            onClick={() => load(true)}
            disabled={loading}
            style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 5,
              cursor: 'pointer', background: C.blueBg, color: C.blue, border: `0.5px solid ${C.blueBorder}`,
            }}
          >{loading ? 'Loading…' : 'Load more'}</button>
        )}
      </div>

      {modal !== undefined && (
        <ItemModal
          item={modal}
          ticketId={ticket.id}
          onDone={() => load(false)}
          onClose={() => setModal(undefined)}
        />
      )}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ECR Image Panel
// ═══════════════════════════════════════════════════════════════════════════════

export function ECRImagePanel({ ticket }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    listEcrImages(ticket.id)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to list images'))
      .finally(() => setLoading(false))
  }, [ticket.id])

  return (
    <Panel>
      <SectionHeader icon="📦" title="ECR Repository" subtitle={data?.repo_name || 'Container Registry'} />

      {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888', fontSize: 12 }}><Spinner /> Loading…</div>}
      {error   && <ErrorBar msg={error} />}

      {data && (
        <>
          <CodeBlock label="Authenticate Docker" code={data.auth_command} />

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>Images ({data.total})</div>

            {data.images.length === 0 ? (
              <InfoNote color={C.blue} bg={C.blueBg} border={C.blueBorder}>
                No images pushed yet. Use the push guide below to push your first image.
              </InfoNote>
            ) : (
              data.images.map((img, i) => (
                <div key={i} style={{
                  background: '#FAFAFA', border: '0.5px solid #EBEBEB',
                  borderRadius: 6, padding: '10px 12px', marginTop: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: C.mono, color: '#111' }}>:{img.tag}</span>
                    {img.pushed_at && (
                      <span style={{ fontSize: 10, color: '#AAA' }}>
                        {new Date(img.pushed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <CodeBlock label="Pull" code={img.pull_command} />
                </div>
              ))
            )}
          </div>

          <CodeBlock label="Push a new image" code={[
            `# 1. Authenticate (once per session)`,
            data.auth_command,
            ``,
            `# 2. Tag your local image`,
            `docker tag <local-image> ${data.repo_url}:latest`,
            ``,
            `# 3. Push`,
            `docker push ${data.repo_url}:latest`,
          ].join('\n')} />
        </>
      )}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// RDS Connection Panel
// ═══════════════════════════════════════════════════════════════════════════════

export function RDSConnection({ ticket }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    getRdsConnection(ticket.id)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load connection info'))
      .finally(() => setLoading(false))
  }, [ticket.id])

  return (
    <Panel>
      <SectionHeader icon="🗄️" title="Database Connection" subtitle="PostgreSQL · RDS" />

      {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888', fontSize: 12 }}><Spinner /> Loading…</div>}
      {error   && <ErrorBar msg={error} />}

      {data && (
        <>
          <InfoNote>
            ⚠ Ensure your IP is allowed in the RDS security group before connecting (port {data.port}).
          </InfoNote>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 12 }}>
            <FieldRow label="Host"     value={data.host} />
            <FieldRow label="Port"     value={data.port} />
            <FieldRow label="Database" value={data.db_name} />
            <FieldRow label="Username" value={data.username} />
          </div>

          {data.password_available ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={labelStyle}>Password</div>
                <SmallBtn onClick={() => setShowPwd(p => !p)} bg="#F0F0F0" color="#555" border="#DDD">
                  {showPwd ? 'hide' : 'show'}
                </SmallBtn>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  fontSize: 11, fontFamily: C.mono, color: '#111', flex: 1,
                  letterSpacing: showPwd ? 'normal' : '0.2em',
                }}>
                  {showPwd ? data.password : '••••••••••••'}
                </span>
                {showPwd && <CopyBtn value={data.password} />}
              </div>
            </div>
          ) : (
            <InfoNote color={C.green} bg={C.greenBg} border={C.greenBorder}>
              ℹ Password was sent to the requester's email at provisioning time. Contact your admin if needed.
            </InfoNote>
          )}

          <CodeBlock label="Connection string (libpq / SQLAlchemy)" code={data.connection_string} />
          <CodeBlock label="psql" code={data.psql_command} />

          <div style={{ marginTop: 4 }}>
            <div style={labelStyle}>Connect via pgAdmin</div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8, background: '#F9F9F9', border: '0.5px solid #EBEBEB', borderRadius: 6, padding: '8px 12px' }}>
              Servers → Register Server → <strong>Connection</strong> tab<br />
              Host: <code style={{ fontFamily: C.mono }}>{data.host}</code> &nbsp;·&nbsp;
              Port: <code style={{ fontFamily: C.mono }}>{data.port}</code> &nbsp;·&nbsp;
              DB: <code style={{ fontFamily: C.mono }}>{data.db_name}</code> &nbsp;·&nbsp;
              User: <code style={{ fontFamily: C.mono }}>{data.username}</code>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EC2 SSH Panel
// ═══════════════════════════════════════════════════════════════════════════════

export function EC2SSHPanel({ ticket }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    getEc2SshInfo(ticket.id)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load SSH info'))
      .finally(() => setLoading(false))
  }, [ticket.id])

  return (
    <Panel>
      <SectionHeader icon="🔐" title="SSH Access" subtitle="EC2 · Ubuntu" />

      {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#888', fontSize: 12 }}><Spinner /> Loading…</div>}
      {error   && <ErrorBar msg={error} />}

      {data && (
        <>
          <InfoNote>
            🔑 Shared key pair: <code style={{ fontFamily: C.mono }}>{data.key_name}.pem</code> — contact your admin if you don't have it.
          </InfoNote>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 12 }}>
            <FieldRow label="Public IP"  value={data.public_ip} />
            <FieldRow label="Username"   value={data.username} />
            <FieldRow label="Port"       value={String(data.port)} />
            <FieldRow label="OS"         value={data.os} />
          </div>

          <CodeBlock label="SSH command" code={data.ssh_command} />
          <CodeBlock label="SCP — copy a file to the instance" code={data.scp_example} />

          <CodeBlock label="First-time setup" code={[
            `# Restrict key permissions (required by SSH)`,
            `chmod 400 ~/.ssh/${data.key_name}.pem`,
            ``,
            `# Connect`,
            data.ssh_command,
          ].join('\n')} />

          {data.web_url && (
            <div style={{ marginTop: 6 }}>
              <div style={labelStyle}>Web URL</div>
              <a href={data.web_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: C.blue, fontFamily: C.mono }}>
                {data.web_url}
              </a>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ResourcePanel — auto-selects by template_type
// ═══════════════════════════════════════════════════════════════════════════════

export function ResourcePanel({ ticket }) {
  const type = ticket.template_type || ticket.template?.template_type

  if (type === 's3_storage' || type === 's3_static_site') return <S3FileManager   ticket={ticket} />
  if (type === 'dynamodb')                                 return <DynamoDBBrowser ticket={ticket} />
  if (type === 'ecr_repository')                           return <ECRImagePanel   ticket={ticket} />
  if (type === 'database')                                 return <RDSConnection   ticket={ticket} />
  if (type === 'web_app')                                  return <EC2SSHPanel     ticket={ticket} />

  // serverless / sns / ecs — "Open in Console" federated link is sufficient
  return null
}

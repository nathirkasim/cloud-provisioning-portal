import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getTicket, extendEnvironment, getUploadUrl, getConsoleLink, cancelTicket,
  listS3Objects, deleteS3Object, getS3DownloadUrl, getS3UploadUrl,
  scanDynamoDB, putDynamoItem, deleteDynamoItem,
  listEcrImages, getRdsConnection, getEc2SshInfo,
} from '../services/api'
import { ResourcePanel } from '../components/ResourcePanels'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending_approval:     { label: 'Pending approval',    color: '#BA7517', bg: '#FAEEDA', dot: '#854F0B', pulse: false },
  approved:             { label: 'Approved',             color: '#185FA5', bg: '#D6E9FB', dot: '#185FA5', pulse: false },
  provisioning:         { label: 'Provisioning',         color: '#534AB7', bg: '#E5E3FD', dot: '#534AB7', pulse: true  },
  active:               { label: 'Active',               color: '#27500A', bg: '#D4EDB8', dot: '#3B6D11', pulse: false },
  expiring:             { label: 'Expiring soon',        color: '#791F1F', bg: '#FCEBEB', dot: '#A32D2D', pulse: true  },
  expired:              { label: 'Expired',              color: '#666',    bg: '#F0F0F0', dot: '#999',    pulse: false },
  rejected:             { label: 'Rejected',             color: '#791F1F', bg: '#FCEBEB', dot: '#A32D2D', pulse: false },
  cancelled:            { label: 'Cancelled',            color: '#888',    bg: '#F0F0F0', dot: '#AAA',    pulse: false },
  pending_manual_setup: { label: 'Awaiting admin setup', color: '#633806', bg: '#FAEEDA', dot: '#854F0B', pulse: true  },
  in_progress:          { label: 'Admin working on it',  color: '#085041', bg: '#D2F0E7', dot: '#1D9E75', pulse: true  },
}

const TEMPLATE_META = {
  web_app:           { icon: '🖥️', label: 'EC2 Web Application'    },
  database:          { icon: '🗄️', label: 'RDS PostgreSQL'          },
  serverless:        { icon: '⚡',  label: 'Lambda Serverless'       },
  s3_static_site:    { icon: '🌐', label: 'S3 Static Site'          },
  s3_storage:        { icon: '🪣', label: 'S3 Storage Bucket'       },
  sns_topic:         { icon: '📣', label: 'SNS Topic'               },
  dynamodb:          { icon: '⚡',  label: 'DynamoDB Table'          },
  ecr_repository:    { icon: '📦', label: 'ECR Repository'          },
  ecs_container:     { icon: '🐳', label: 'ECS Fargate Container'   },
  elasticache_redis: { icon: '🔴', label: 'ElastiCache Redis'       },
  cloudfront_cdn:    { icon: '🌍', label: 'CloudFront CDN'          },
  rds_read_replica:  { icon: '🗄️', label: 'RDS Read Replica'       },
  secrets_manager:   { icon: '🔐', label: 'AWS Secrets Manager'     },
  waf_rules:         { icon: '🛡️', label: 'WAF v2 Rules'           },
  kinesis_stream:    { icon: '🌊', label: 'Kinesis Data Stream'     },
  eks_cluster:       { icon: '☸️', label: 'EKS Cluster'             },
  codepipeline:      { icon: '🔄', label: 'CodePipeline / CI-CD'   },
  opensearch:        { icon: '🔍', label: 'OpenSearch'              },
  redshift:          { icon: '🏢', label: 'Redshift'                },
  custom_request:    { icon: '✨', label: 'Custom Resource Request' },
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#666', bg: '#eee', dot: '#999', pulse: false }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        animation: cfg.pulse ? 'cpulse 1.4s ease-in-out infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  )
}

function CopyField({ label, value, mono = true, isLink = false }) {
  const [copied, setCopied] = useState(false)
  if (!value) return (
    <div>
      <div style={labelSt}>{label}</div>
      <div style={{ fontSize: 12, color: '#BBB', fontStyle: 'italic' }}>Not available</div>
    </div>
  )
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <div style={labelSt}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 2 }}>
        {isLink ? (
          <a href={value} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: '#378ADD', wordBreak: 'break-all', fontFamily: mono ? 'DM Mono, monospace' : 'inherit' }}>
            {value}
          </a>
        ) : (
          <span style={{ fontSize: 12, color: '#111', wordBreak: 'break-all', fontFamily: mono ? 'DM Mono, monospace' : 'inherit', lineHeight: 1.5 }}>
            {value}
          </span>
        )}
        <button onClick={handleCopy} style={{
          flexShrink: 0, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
          background: copied ? '#D4EDB8' : '#F0F0F0',
          color: copied ? '#27500A' : '#888',
          border: `0.5px solid ${copied ? '#A8D98A' : '#DCDCDC'}`,
          cursor: 'pointer', transition: 'all 0.15s', marginTop: 1,
        }}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
    </div>
  )
}

const labelSt = { fontSize: 10, fontWeight: 600, color: '#AAA', letterSpacing: '0.05em', textTransform: 'uppercase' }

function SidebarRow({ label, value, mono = false }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 7, borderBottom: '0.5px solid #F0F0F0', marginBottom: 7 }}>
      <span style={{ fontSize: 11, color: '#AAA' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: '#111', fontFamily: mono ? 'DM Mono, monospace' : 'inherit', textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

// ─── Resource endpoint section by type ────────────────────────────────────────

function ResourceEndpoints({ ticket }) {
  const type = ticket.template_type || ticket.template?.template_type
  const out = ticket.provisioning_output || {}
  const v = (key) => { const val = out[key]; if (val && typeof val === 'object' && 'value' in val) return val.value; return val }

  const sections = {
    web_app: (
      <>
        <CopyField label="Public URL" value={ticket.environment_url} isLink mono={false} />
        <CopyField label="Instance ID" value={ticket.instance_id} />
        <CopyField label="Public IP" value={v('web_app_public_ip')} />
      </>
    ),
    database: (
      <>
        <CopyField label="Endpoint" value={ticket.environment_url} />
        <CopyField label="DB Instance ID" value={ticket.instance_id} />
        <div style={{ fontSize: 11, color: '#854F0B', background: '#FAEEDA', borderRadius: 5, padding: '7px 10px', marginTop: 4 }}>
          Password was auto-generated and emailed to you at provisioning time.
        </div>
      </>
    ),
    serverless: (
      <>
        <CopyField label="API endpoint" value={ticket.environment_url} isLink mono={false} />
        <CopyField label="Function name" value={ticket.instance_id} />
      </>
    ),
    s3_static_site: (
      <>
        <CopyField label="Website URL" value={ticket.environment_url} isLink mono={false} />
        <CopyField label="Bucket name" value={ticket.instance_id} />
        <div style={{ fontSize: 11, color: '#633806', background: '#FAEEDA', borderRadius: 5, padding: '7px 10px', marginTop: 4 }}>
          📋 Upload your <code>index.html</code> using the file manager below to update your site.
        </div>
      </>
    ),
    s3_storage: (
      <>
        <CopyField label="Bucket name" value={ticket.instance_id} />
        <CopyField label="Bucket ARN" value={ticket.environment_url} />
        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Private bucket · versioning enabled · public access blocked.</div>
      </>
    ),
    ecr_repository: (
      <>
        <CopyField label="Repository URL" value={ticket.environment_url} />
        <CopyField label="Repository name" value={ticket.instance_id} />
        {ticket.environment_url && (
          <div style={{ marginTop: 8 }}>
            <div style={labelSt}>Docker push commands</div>
            <pre style={{ fontSize: 10, background: '#F4F4F4', border: '0.5px solid #E0E0E0', borderRadius: 5, padding: '8px 10px', fontFamily: 'DM Mono, monospace', marginTop: 4, overflowX: 'auto', lineHeight: 1.6 }}>
              {`docker tag <image> ${ticket.environment_url}:latest\ndocker push ${ticket.environment_url}:latest`}
            </pre>
          </div>
        )}
      </>
    ),
    ecs_container: (
      <>
        <div style={{ fontSize: 11, color: '#854F0B', background: '#FAEEDA', borderRadius: 5, padding: '7px 10px', marginBottom: 8 }}>
          ⚠️ Not free tier — ~$9/month while running
        </div>
        <CopyField label="Service URL" value={ticket.environment_url} isLink mono={false} />
        <CopyField label="Cluster name" value={ticket.instance_id} />
        {!ticket.environment_url && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Public IP is assigned at runtime — may take a minute after provisioning to appear.</div>}
      </>
    ),
    sns_topic: (
      <>
        <CopyField label="Topic ARN" value={ticket.environment_url} />
        <CopyField label="Topic name" value={ticket.instance_id} />
      </>
    ),
    dynamodb: (
      <>
        <CopyField label="Table ARN" value={ticket.environment_url} />
        <CopyField label="Table name" value={ticket.instance_id} />
        <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>On-demand billing · 25GB free storage tier.</div>
      </>
    ),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections[type] || (
        <>
          <CopyField label="Endpoint / URL" value={ticket.environment_url} isLink={ticket.environment_url?.startsWith('http')} />
          <CopyField label="Resource ID" value={ticket.instance_id} />
        </>
      )}
    </div>
  )
}

// ─── Lifetime / TTL bar ───────────────────────────────────────────────────────

function LifetimeBar({ ticket, extendDays, setExtendDays, onExtend, extending }) {
  const [showExtend, setShowExtend] = useState(false)
  const created = new Date(ticket.created_at)
  const expires = new Date(created)
  expires.setDate(expires.getDate() + ticket.duration_days)
  const total = ticket.duration_days * 86400000
  const remaining = expires - Date.now()
  const daysLeft = Math.ceil(remaining / 86400000)
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const warn = daysLeft <= 3

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 10 }}>Environment lifetime</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: '#AAA' }}>Created {created.toLocaleDateString()}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: warn ? '#A32D2D' : '#555' }}>
          {daysLeft <= 0 ? 'Expired' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expires.toLocaleDateString()})`}
        </span>
      </div>
      <div style={{ height: 5, background: '#EBEBEB', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: warn ? '#E24B4A' : '#3B6D11', borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      {!showExtend ? (
        <button onClick={() => setShowExtend(true)} style={{
          fontSize: 11, fontWeight: 500, padding: '5px 12px', borderRadius: 5,
          background: '#E6F1FB', color: '#185FA5', border: '0.5px solid #B0D0EF', cursor: 'pointer',
        }}>
          + Extend environment
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#666' }}>Extend by</span>
            <input
              type="number" min="1" max="30" value={extendDays}
              onChange={e => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) setExtendDays(Math.min(30, Math.max(1, val)))
              }}
              style={{
                width: 52, fontSize: 12, padding: '4px 8px', fontFamily: 'inherit',
                border: `0.5px solid ${extendDays < 1 || extendDays > 30 ? '#E24B4A' : '#DCDCDC'}`,
                borderRadius: 5, outline: 'none', background: '#FAFAFA',
              }}
            />
            <span style={{ fontSize: 11, color: '#666' }}>days (max 30)</span>
            <button
              onClick={() => { onExtend(); setShowExtend(false) }}
              disabled={extending || extendDays < 1 || extendDays > 30}
              style={{
                fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 5,
                background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: (extending || extendDays < 1 || extendDays > 30) ? 0.4 : 1,
              }}
            >
              {extending ? 'Extending…' : 'Confirm'}
            </button>
            <button onClick={() => setShowExtend(false)} style={{ fontSize: 11, color: '#AAA', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
          {extendDays > 30 && (
            <span style={{ fontSize: 11, color: '#A32D2D' }}>Maximum extension is 30 days</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Provisioning timeline ────────────────────────────────────────────────────

function ProvisioningTimeline({ status }) {
  const steps = [
    { key: 'pending_approval',     label: 'Submitted',       done: true  },
    { key: 'approved',             label: 'Approved',        done: ['approved','provisioning','active'].includes(status) },
    { key: 'provisioning',         label: 'Running Terraform', done: status === 'active', active: status === 'provisioning' },
    { key: 'active',               label: 'Active',          done: status === 'active' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '12px 16px', background: '#F9F9F9', borderRadius: 8, border: '0.5px solid #EBEBEB' }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: s.done ? '#3B6D11' : s.active ? '#7F77DD' : '#E8E8E8',
              border: `2px solid ${s.done ? '#3B6D11' : s.active ? '#7F77DD' : '#D0D0D0'}`,
              animation: s.active ? 'cpulse 1.2s ease-in-out infinite' : 'none',
            }}>
              {s.done
                ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2"><polyline points="2,5 4,8 8,2" /></svg>
                : s.active
                  ? <div style={{ width: 7, height: 7, borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                  : null
              }
            </div>
            <span style={{ fontSize: 9, color: s.done ? '#3B6D11' : s.active ? '#534AB7' : '#AAA', fontWeight: s.active || s.done ? 600 : 400, whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: s.done ? '#3B6D11' : '#E0E0E0', margin: '0 4px', marginBottom: 18, borderRadius: 1 }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── File uploader ────────────────────────────────────────────────────────────

function FileUploader({ ticketId }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const { data } = await getUploadUrl(ticketId, file.name)
      const res = await fetch(data.upload_url, { method: 'PUT', body: file, mode: 'cors', headers: { 'Content-Type': data.content_type } })
      if (res.ok) setResult({ type: 'success', msg: `✓ ${file.name} uploaded successfully` })
      else {
        const body = await res.text().catch(() => '')
        const detail = body.match(/<Message>(.+?)<\/Message>/)?.[1] || `HTTP ${res.status}`
        throw new Error(`Upload failed: ${detail}`)
      }
    } catch (err) {
      setResult({ type: 'error', msg: err.message || 'Upload failed' })
    } finally { setUploading(false) }
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 4 }}>File upload</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>Upload files directly to this S3 resource via pre-signed URL.</div>
      {result && (
        <div style={{
          fontSize: 11, fontWeight: 500, padding: '6px 10px', borderRadius: 5, marginBottom: 10,
          background: result.type === 'success' ? '#D4EDB8' : '#FCEBEB',
          color: result.type === 'success' ? '#27500A' : '#791F1F',
          border: `0.5px solid ${result.type === 'success' ? '#A8D98A' : '#FBBCBC'}`,
        }}>
          {result.msg}
        </div>
      )}
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: `1.5px dashed ${uploading ? '#D0D0D0' : '#B0D0EF'}`,
        borderRadius: 7, padding: '20px', cursor: uploading ? 'not-allowed' : 'pointer',
        background: uploading ? '#FAFAFA' : '#F5F9FE', transition: 'all 0.15s', gap: 4,
      }}>
        {uploading
          ? <><div style={{ width: 20, height: 20, border: '2px solid #D0D0D0', borderTop: '2px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 4 }} /><span style={{ fontSize: 11, color: '#888' }}>Uploading…</span></>
          : <><span style={{ fontSize: 20 }}>☁️</span><span style={{ fontSize: 11, fontWeight: 500, color: '#378ADD' }}>Select or drop file</span><span style={{ fontSize: 10, color: '#AAA' }}>Max 50MB</span></>
        }
        <input type="file" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
      </label>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [extendDays, setExtendDays] = useState(7)
  const [extending, setExtending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const pollRef = useRef(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelTicket(id)
      setConfirmCancel(false)
      showToast('Request cancelled')
      getTicket(id).then(r => setTicket(r.data)).catch(() => {})
    } catch (err) { showToast(err.response?.data?.detail || 'Failed to cancel', 'error') }
    finally { setCancelling(false) }
  }

  useEffect(() => {
    getTicket(id).then(res => setTicket(res.data)).catch(() => showToast('Ticket not found', 'error')).finally(() => setLoading(false))
    return () => clearInterval(pollRef.current)
  }, [id])

  useEffect(() => {
    if (!ticket) return
    const transient = ['provisioning','approved','expiring','pending_manual_setup','in_progress'].includes(ticket.status)
    clearInterval(pollRef.current)
    if (transient) pollRef.current = setInterval(() => getTicket(id).then(r => setTicket(r.data)).catch(() => {}), 10000)
    return () => clearInterval(pollRef.current)
  }, [ticket?.status, id])

  const handleExtend = async () => {
    setExtending(true)
    try {
      const res = await extendEnvironment(id, extendDays)
      showToast(res.data.message)
      getTicket(id).then(r => setTicket(r.data))
    } catch (err) { showToast(err.response?.data?.detail || 'Failed to extend', 'error') }
    finally { setExtending(false) }
  }

  const handleConsole = async () => {
    try { const res = await getConsoleLink(id); window.open(res.data.url, '_blank') }
    catch (err) { showToast(err.response?.data?.detail || 'IAM session required', 'error') }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #E0E0E0', borderTop: '2.5px solid #185FA5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!ticket) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', fontFamily: 'system-ui', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#888' }}>Ticket not found</div>
      <button onClick={() => navigate('/dashboard')} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer' }}>← Back to dashboard</button>
    </div>
  )

  const templateType = ticket.template_type || ticket.template?.template_type
  const meta = TEMPLATE_META[templateType] || { icon: '☁️', label: templateType || 'AWS Service' }
  const isManual = ticket.template?.is_manual || ['pending_manual_setup','in_progress'].includes(ticket.status)
  const isCustom = templateType === 'custom_request'
  const isActive = ticket.status === 'active' || ticket.status === 'expiring'
  const isProvisioning = ['provisioning','approved'].includes(ticket.status)
  const isManualPending = ticket.status === 'pending_manual_setup' || ticket.status === 'in_progress'
  const isPending = ticket.status === 'pending_approval'
  const isTerminal = ['expired','rejected','cancelled'].includes(ticket.status)
  const showUpload = isActive && (templateType === 's3_static_site' || templateType === 's3_storage')

  const created = new Date(ticket.created_at)
  const expires = new Date(created)
  expires.setDate(expires.getDate() + ticket.duration_days)

  const manualOut = ticket.provisioning_output?.resource_details

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        @keyframes cpulse { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { transform: translateY(5px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #DDD; border-radius: 4px; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 300,
          padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500,
          background: toast.type === 'error' ? '#FCEBEB' : '#D4EDB8',
          color: toast.type === 'error' ? '#791F1F' : '#27500A',
          border: `0.5px solid ${toast.type === 'error' ? '#FBBCBC' : '#A8D98A'}`,
          animation: 'fadeUp 0.2s ease', boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header bar */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #E8E8E8', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/dashboard')} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Environments
          </button>
          <span style={{ color: '#DDD' }}>/</span>
          <span style={{ fontSize: 12, color: '#333', fontFamily: 'DM Mono, monospace' }}>{ticket.ticket_number}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isActive && (
            <button onClick={handleConsole} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
              padding: '6px 12px', borderRadius: 5, background: '#FF9900', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              Open in AWS Console
            </button>
          )}
          {isPending && !confirmCancel && (
            <button onClick={() => setConfirmCancel(true)} style={{
              fontSize: 11, fontWeight: 500, padding: '6px 12px', borderRadius: 5,
              background: 'transparent', color: '#A32D2D', border: '0.5px solid #FBBCBC', cursor: 'pointer',
            }}>
              Cancel request
            </button>
          )}
          {isPending && confirmCancel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FCEBEB', border: '0.5px solid #FBBCBC', borderRadius: 5, padding: '5px 10px' }}>
              <span style={{ fontSize: 11, color: '#A32D2D', fontWeight: 500 }}>Cancel this request?</span>
              <button onClick={handleCancel} disabled={cancelling} style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4,
                background: '#A32D2D', color: '#fff', border: 'none', cursor: 'pointer', opacity: cancelling ? 0.6 : 1,
              }}>{cancelling ? '…' : 'Yes, cancel'}</button>
              <button onClick={() => setConfirmCancel(false)} style={{ fontSize: 11, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer' }}>Keep</button>
            </div>
          )}
          <StatusPill status={ticket.status} />
        </div>
      </div>

      {/* Page body */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Title card */}
          <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '16px 18px', animation: 'fadeUp 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F4F4F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{ticket.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#888' }}>{meta.label}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CCC' }} />
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#AAA' }}>{ticket.ticket_number}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CCC' }} />
                  <span style={{ fontSize: 11, color: '#AAA' }}>Created {created.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Provisioning timeline */}
          {(isProvisioning || isPending) && !isManual && (
            <div style={{ animation: 'fadeUp 0.25s ease' }}>
              <ProvisioningTimeline status={ticket.status} />
            </div>
          )}

          {/* Provisioning spinner */}
          {isProvisioning && (
            <div style={{ background: '#E5E3FD', border: '0.5px solid #C9C6F7', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeUp 0.3s ease' }}>
              <div style={{ width: 18, height: 18, border: '2.5px solid #C9C6F7', borderTop: '2.5px solid #534AB7', borderRadius: '50%', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#3C3489' }}>Terraform is running</div>
                <div style={{ fontSize: 11, color: '#6059C0', marginTop: 2 }}>Your environment is being provisioned on AWS. This takes 30–60 seconds. Page auto-refreshes.</div>
              </div>
            </div>
          )}

          {/* Manual pending / in progress */}
          {isManualPending && (
            <div style={{
              background: ticket.status === 'in_progress' ? '#D2F0E7' : '#FAEEDA',
              border: `0.5px solid ${ticket.status === 'in_progress' ? '#9FD9C2' : '#F5D08A'}`,
              borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, animation: 'fadeUp 0.3s ease',
            }}>
              <span style={{ fontSize: 20 }}>{ticket.status === 'in_progress' ? '🔧' : '⏳'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: ticket.status === 'in_progress' ? '#085041' : '#633806' }}>
                  {ticket.status === 'in_progress' ? 'Admin is working on it' : 'Awaiting admin setup'}
                </div>
                <div style={{ fontSize: 11, color: ticket.status === 'in_progress' ? '#0F6E56' : '#854F0B', marginTop: 3 }}>
                  {ticket.status === 'in_progress'
                    ? 'An admin has picked up your request and is actively provisioning. You\'ll be notified by email when ready.'
                    : `Your request is approved and queued. SLA: ${ticket.template?.resources?.sla_days || 2} business day(s). Email notification when live.`
                  }
                </div>
              </div>
            </div>
          )}

          {/* Rejected / cancelled notice */}
          {(ticket.status === 'rejected' || ticket.status === 'cancelled') && ticket.rejection_reason && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #FBBCBC', borderRadius: 8, padding: '14px 16px', animation: 'fadeUp 0.25s ease' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#791F1F', marginBottom: 4 }}>
                {ticket.status === 'rejected' ? 'Rejection reason' : 'Cancellation note'}
              </div>
              <div style={{ fontSize: 12, color: '#A32D2D' }}>{ticket.rejection_reason}</div>
            </div>
          )}

          {/* Custom request details */}
          {isCustom && ticket.requested_resources && (
            <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px', animation: 'fadeUp 0.3s ease' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 10 }}>✨ Custom request details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Resource type', ticket.requested_resources.resource_type_name],
                  ['Cloud provider', ticket.requested_resources.cloud_provider],
                  ['Preferred region', ticket.requested_resources.preferred_region],
                  ['Urgency', ticket.requested_resources.urgency],
                  ['Estimated usage', ticket.requested_resources.estimated_usage],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <div style={labelSt}>{label}</div>
                    <div style={{ fontSize: 12, color: '#111', marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active resource endpoints */}
          {isActive && !isManual && (
            <div style={{ background: '#F0FAF5', border: '0.5px solid #9FD9C2', borderRadius: 8, padding: '14px 16px', animation: 'fadeUp 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#085041' }}>Resource is live</span>
              </div>
              <ResourceEndpoints ticket={ticket} />
            </div>
          )}

          {/* Manual active resource details */}
          {isActive && isManual && manualOut && (
            <div style={{ background: '#F0FAF5', border: '0.5px solid #9FD9C2', borderRadius: 8, padding: '14px 16px', animation: 'fadeUp 0.3s ease' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#085041', marginBottom: 10 }}>✅ Resource is live</div>
              {ticket.environment_url && <CopyField label="Endpoint / URL" value={ticket.environment_url} isLink={ticket.environment_url.startsWith('http')} />}
              {ticket.instance_id && <div style={{ marginTop: 10 }}><CopyField label="Resource ID / ARN" value={ticket.instance_id} /></div>}
              <div style={{ marginTop: 12 }}>
                <div style={labelSt}>Connection details (from admin)</div>
                <pre style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', background: '#fff', border: '0.5px solid #C8EDD9', borderRadius: 5, padding: '8px 10px', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 180, overflowY: 'auto', color: '#111' }}>
                  {manualOut}
                </pre>
              </div>
            </div>
          )}

          {/* Lifetime bar (active only) */}
          {isActive && (
            <LifetimeBar
              ticket={ticket}
              extendDays={extendDays}
              setExtendDays={setExtendDays}
              onExtend={handleExtend}
              extending={extending}
            />
          )}

          {/* Resource-level panel (S3 file manager, DynamoDB browser, ECR images, RDS connection, EC2 SSH) */}
          {isActive && !isManual && <ResourcePanel ticket={ticket} />}

        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.3s ease' }}>

          {/* Cost */}
          <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#AAA', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Cost</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#111' }}>${ticket.estimated_cost_usd ?? '0.00'}</div>
            <div style={{ fontSize: 10, color: '#AAA', marginTop: 3 }}>estimated total for {ticket.duration_days} days</div>
          </div>

          {/* Request details */}
          <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#AAA', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>Request details</div>
            <SidebarRow label="Service" value={meta.label} />
            <SidebarRow label="Duration" value={`${ticket.duration_days} days`} />
            <SidebarRow label="Requested" value={created.toLocaleDateString()} />
            {isActive && <SidebarRow label="Expires" value={expires.toLocaleDateString()} />}
            {ticket.requester_name && <SidebarRow label="Requested by" value={ticket.requester_name} />}
            {ticket.approver_name && <SidebarRow label="Approved by" value={ticket.approver_name} />}
          </div>

          {/* Justification */}
          <div style={{ background: '#fff', border: '0.5px solid #E8E8E8', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#AAA', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Justification</div>
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, fontStyle: 'italic' }}>"{ticket.justification}"</div>
          </div>

          {/* Ticket ID */}
          <div style={{ background: '#FAFAFA', border: '0.5px solid #EBEBEB', borderRadius: 8, padding: '10px 14px' }}>
            <div style={labelSt}>Ticket</div>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#378ADD', marginTop: 3 }}>{ticket.ticket_number}</div>
          </div>

        </div>
      </div>
    </div>
  )
}

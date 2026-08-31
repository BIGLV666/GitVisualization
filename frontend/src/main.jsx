import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// 统一请求封装：解析后端 Result 结构 { code, message, data }，code 非 0 视为失败
async function request(path, options = {}) {
  const res = await fetch(path, options)
  const payload = await res.json().catch(() => ({}))
  if (payload && typeof payload.code === 'number' && payload.code !== 0) {
    throw new Error(payload.message || '请求失败')
  }
  return payload?.data ?? payload
}

const glyph = n => ({ search: '⌕', folder: '▣', plus: '+', refresh: '↻', collapse: '‹', expand: '›', close: '×', edit: '✎', trash: '🗑', branch: '⑂', merge: '⤴', newb: '✚', commit: '✓', stash: '▤', pop: '↺', push: '⤒', gear: '⚙' }[n] || '•')

function formatTime(time) {
  if (!time) return ''
  const diff = Date.now() - time
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

const PALETTE = ['#55b997', '#9475dc', '#dc9d45', '#55b6c1', '#e07a5f', '#7fb069', '#d16ba5', '#5c8d89']
const LANE_HEIGHT = 88

function isMain(b) { return b === 'main' || b === 'master' }

const fileStateMeta = {
  staged: { label: '已暂存', cls: 'staged' },
  modified: { label: '已修改', cls: 'modified' },
  removed: { label: '已删除', cls: 'removed' },
  untracked: { label: '未跟踪', cls: 'untracked' }
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [repos, setRepos] = useState([])
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [commits, setCommits] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  // 悬浮提示框（固定定位，避免被裁剪）
  const [tip, setTip] = useState(null)

  // 工作区变更
  const [status, setStatus] = useState(null)
  const [checked, setChecked] = useState(() => new Set())

  // 仓库表单弹窗（新增 / 编辑）
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', warehousePath: '', remoteURL: '' })

  // 分支操作弹窗（切换 / 合并 / 新建）
  const [branchModal, setBranchModal] = useState(null)
  const [branchInput, setBranchInput] = useState('')

  // 提交弹窗
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')

  // 配置弹窗
  const [configOpen, setConfigOpen] = useState(false)
  const [configForm, setConfigForm] = useState({ username: '', email: '' })

  // 变更面板折叠 / 文件差异弹窗
  const [changesOpen, setChangesOpen] = useState(true)
  const [diffView, setDiffView] = useState(null)

  const notify = msg => setToast(msg)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  async function loadRepos(keepSelection = true) {
    try {
      const list = await request('/warehouse')
      const arr = Array.isArray(list) ? list : []
      setRepos(arr)
      const keep = arr.some(r => r.warehouseId === selectedRepo?.warehouseId)
      if (!keepSelection || !keep) setSelectedRepo(arr[0] || null)
    } catch (e) {
      notify(e.message || '加载仓库失败')
    }
  }

  async function loadCommits(repo) {
    if (!repo) { setCommits([]); setSelectedId(null); return }
    setLoading(true)
    try {
      const list = await request(`/git/${repo.warehouseId}/commits`)
      const arr = Array.isArray(list) ? list : []
      setCommits(arr)
      setSelectedId(arr.find(c => c.isHead)?.id || arr[0]?.id || null)
    } catch (e) {
      setCommits([])
      notify(e.message || '加载提交记录失败')
    } finally {
      setLoading(false)
    }
  }

  async function loadStatus(repo) {
    if (!repo) { setStatus(null); return }
    try {
      const s = await request(`/git/${repo.warehouseId}/status`)
      setStatus(s || { staged: [], modified: [], removed: [], untracked: [], clean: true })
    } catch (e) {
      setStatus(null)
    }
  }

  function refresh(repo) {
    loadCommits(repo)
    loadStatus(repo)
  }

  useEffect(() => { loadRepos() }, [])
  useEffect(() => { if (selectedRepo) refresh(selectedRepo) }, [selectedRepo?.warehouseId])

  // 分支列表与颜色
  const branchList = useMemo(() => {
    const set = new Set(commits.map(c => c.branch).filter(Boolean))
    return [...set].sort((a, b) => {
      const ra = isMain(a) ? 0 : 1
      const rb = isMain(b) ? 0 : 1
      return ra - rb || a.localeCompare(b)
    })
  }, [commits])

  const branchColors = useMemo(() => {
    const m = {}
    branchList.forEach((b, i) => { m[b] = PALETTE[i % PALETTE.length] })
    return m
  }, [branchList])

  const visibleCommits = useMemo(() => commits.filter(c => {
    const okBranch = branch === 'all' || c.branch === branch
    const okSearch = `${c.title} ${c.id} ${c.fullId} ${c.author}`.toLowerCase().includes(search.toLowerCase())
    return okBranch && okSearch
  }), [commits, branch, search])

  const maxLane = useMemo(() => commits.reduce((m, c) => Math.max(m, c.lane ?? 0), 0), [commits])

  const positions = useMemo(() => {
    const map = {}
    visibleCommits.forEach((c, i) => {
      map[c.id] = {
        x: 90 + i * 150,
        y: 110 + (c.lane ?? 0) * LANE_HEIGHT,
        color: branchColors[c.branch] || '#8aa5b0'
      }
    })
    return map
  }, [visibleCommits, branchColors])

  const byFullId = useMemo(() => Object.fromEntries(commits.map(c => [c.fullId, c])), [commits])

  const graphWidth = Math.max(920, visibleCommits.length * 150 + 120)
  const graphHeight = Math.max(400, (maxLane + 1) * LANE_HEIGHT + 60)
  const selected = commits.find(c => c.id === selectedId) || commits[0] || null
  const hasUnnamed = useMemo(() => commits.some(c => !c.branch), [commits])

  // 工作区变更的文件清单
  const changeFiles = useMemo(() => {
    if (!status) return []
    return [
      ...(status.staged || []).map(p => ({ path: p, state: 'staged' })),
      ...(status.modified || []).map(p => ({ path: p, state: 'modified' })),
      ...(status.removed || []).map(p => ({ path: p, state: 'removed' })),
      ...(status.untracked || []).map(p => ({ path: p, state: 'untracked' }))
    ]
  }, [status])

  function toggleCheck(path) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // ---- 仓库增删改查 ----
  function openCreate() {
    setEditing(false)
    setForm({ name: '', warehousePath: '', remoteURL: '' })
    setShowForm(true)
  }
  function openEdit(repo) {
    setEditing(true)
    setForm({ name: repo.name, warehousePath: repo.warehousePath, remoteURL: repo.remoteURL || '' })
    setShowForm(true)
  }
  async function submitForm(e) {
    e.preventDefault()
    if (!form.name || !form.warehousePath) { notify('请填写仓库名称和本地路径'); return }
    try {
      if (editing) {
        const updated = await request(`/warehouse/${selectedRepo.warehouseId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
        })
        notify('仓库已更新')
        setSelectedRepo(updated)
        await loadRepos(true)
      } else {
        const created = await request('/warehouse', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
        })
        notify('仓库已登记')
        await loadRepos(false)
        setSelectedRepo(created)
      }
      setShowForm(false)
    } catch (err) {
      notify(err.message || '操作失败')
    }
  }
  async function removeRepo(repo) {
    if (!window.confirm(`确定删除仓库「${repo.name}」吗？此操作不可恢复。`)) return
    try {
      await request(`/warehouse/${repo.warehouseId}`, { method: 'DELETE' })
      notify('仓库已删除')
      setSelectedRepo(null)
      await loadRepos(false)
    } catch (err) {
      notify(err.message || '删除失败')
    }
  }

  // ---- Git 操作 ----
  const branchModes = {
    create: { title: '新建分支', placeholder: '输入新分支名称', path: 'branch', param: 'name', action: '新建', done: '已新建并切换到分支' },
    switch: { title: '切换分支', placeholder: '输入要切换到的分支名', path: 'switch', param: 'branch', action: '切换', done: '已切换到分支' },
    merge: { title: '合并分支', placeholder: '输入要合并进来的源分支名', path: 'merge', param: 'branch', action: '合并', done: '已合并分支' }
  }
  function openBranchModal(mode) {
    setBranchInput('')
    setBranchModal({ mode })
  }
  async function submitBranch(e) {
    e.preventDefault()
    if (!branchInput.trim()) { notify('请输入分支名称'); return }
    const { mode } = branchModal
    const cfg = branchModes[mode]
    if (!selectedRepo || !cfg) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/${cfg.path}?${cfg.param}=${encodeURIComponent(branchInput.trim())}`, { method: 'POST' })
      notify(`${cfg.done}「${branchInput.trim()}」`)
      setBranchModal(null)
      refresh(selectedRepo)
    } catch (err) {
      notify(err.message || '操作失败')
    }
  }

  async function postJson(path, body, okMsg, failMsg, thenRefresh) {
    try {
      await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      notify(okMsg)
      if (thenRefresh) refresh(selectedRepo)
      else loadStatus(selectedRepo)
    } catch (err) {
      notify(err.message || failMsg)
    }
  }

  function doStage(paths) {
    if (!selectedRepo) return
    if (paths && paths.length === 0) { notify('请先勾选要暂存的文件'); return }
    postJson(`/git/${selectedRepo.warehouseId}/stage`, paths, paths.length ? '已暂存选中文件' : '已暂存全部变更', '暂存失败', false)
    setChecked(new Set())
  }
  function doUnstage() {
    if (!selectedRepo) return
    const paths = [...checked]
    if (paths.length === 0) { notify('请先勾选要取消暂存的文件'); return }
    postJson(`/git/${selectedRepo.warehouseId}/unstage`, paths, '已取消暂存', '取消暂存失败', false)
    setChecked(new Set())
  }

  async function submitCommit(e) {
    e.preventDefault()
    if (!commitMessage.trim()) { notify('请输入提交信息'); return }
    if (!selectedRepo) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/commit?message=${encodeURIComponent(commitMessage.trim())}`, { method: 'POST' })
      notify('提交成功')
      setCommitOpen(false)
      setCommitMessage('')
      refresh(selectedRepo)
    } catch (err) {
      notify(err.message || '提交失败')
    }
  }
  async function doStash() {
    if (!selectedRepo) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/stash`, { method: 'POST' })
      notify('已储藏当前修改')
      refresh(selectedRepo)
    } catch (err) {
      notify(err.message || '储藏失败')
    }
  }
  async function doStashPop() {
    if (!selectedRepo) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/stash/pop`, { method: 'POST' })
      notify('已恢复最近一次储藏')
      refresh(selectedRepo)
    } catch (err) {
      notify(err.message || '恢复储藏失败')
    }
  }
  async function doPush() {
    if (!selectedRepo) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/push`, { method: 'POST' })
      notify('推送成功')
    } catch (err) {
      notify(err.message || '推送失败')
    }
  }
  async function openDiff(path) {
    if (!selectedRepo) return
    try {
      const text = await request(`/git/${selectedRepo.warehouseId}/diff?path=${encodeURIComponent(path)}`)
      setDiffView({ path, text: text || '（该文件没有可显示的差异）' })
    } catch (err) {
      notify(err.message || '读取差异失败')
    }
  }
  async function submitConfig(e) {
    e.preventDefault()
    if (!selectedRepo) return
    if (!configForm.username.trim() && !configForm.email.trim()) { notify('请填写用户名或邮箱'); return }
    const q = new URLSearchParams()
    if (configForm.username.trim()) q.set('username', configForm.username.trim())
    if (configForm.email.trim()) q.set('email', configForm.email.trim())
    try {
      await request(`/git/${selectedRepo.warehouseId}/config?${q.toString()}`, { method: 'POST' })
      notify('配置已保存')
      setConfigOpen(false)
    } catch (err) {
      notify(err.message || '配置失败')
    }
  }

  const stagedCount = (status?.staged || []).length

  return <div className={`app ${collapsed ? 'is-collapsed' : ''}`}>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span></span><span></span><span></span></div>
        <div className="brand-copy"><b>GITSCOPE</b><small>仓库拓扑图</small></div>
        <button className="icon-btn sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>{glyph(collapsed ? 'expand' : 'collapse')}</button>
      </div>
      <div className="side-body">
        <div className="side-label">工作区 <button className="mini-btn" title="添加仓库" onClick={openCreate}>{glyph('plus')}</button></div>
        <div className="repo-list">
          {repos.map(repo => (
            <div key={repo.warehouseId} className={`repo-item ${selectedRepo?.warehouseId === repo.warehouseId ? 'active' : ''}`} onClick={() => setSelectedRepo(repo)}>
              <span className="repo-icon">{glyph('folder')}</span>
              <span className="repo-copy"><b>{repo.name}</b><small>{repo.warehousePath?.split(/[\\/]/).pop()}</small></span>
              <span className="repo-actions" onClick={e => e.stopPropagation()}>
                <button className="mini-btn" title="编辑" onClick={() => openEdit(repo)}>{glyph('edit')}</button>
                <button className="mini-btn danger" title="删除" onClick={() => removeRepo(repo)}>{glyph('trash')}</button>
              </span>
              <i className="status-dot" />
            </div>
          ))}
          {repos.length === 0 && <div className="empty-list">暂无仓库，点击右上角「+」登记</div>}
        </div>
        <div className="side-label branch-head">分支 <span>{branchList.length}</span></div>
        <div className="branch-list">
          <button className={`branch-item ${branch === 'all' ? 'active' : ''}`} onClick={() => setBranch('all')}>
            <i className="branch-dot all" /><span>全部分支</span><em>{commits.length}</em>
          </button>
          {branchList.map(b => (
            <button key={b} className={`branch-item ${branch === b ? 'active' : ''}`} onClick={() => setBranch(b)}>
              <i className="branch-dot" style={{ background: branchColors[b] }} /><span>{b}</span>
              <em>{commits.filter(c => c.branch === b).length}</em>
            </button>
          ))}
        </div>
        <div className="side-footer">
          <button className="nav-item"><span>{glyph('refresh')}</span><span>刷新数据</span></button>
          <div className="profile"><div className="avatar">GV</div><span><b>开发者</b><small>维护者</small></span></div>
        </div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div>
          <div className="breadcrumbs"><span>工作区</span><b>/</b><strong>{selectedRepo?.name || '未选择'}</strong><span className="live-pill"><i /> 实时</span></div>
          <h1>仓库拓扑图</h1>
        </div>
        <div className="top-actions">
          <button className="outline-btn" onClick={() => selectedRepo && refresh(selectedRepo)}>{glyph('refresh')} 刷新</button>
          <button className="primary-btn" onClick={openCreate}>{glyph('plus')} 添加仓库</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="search"><span>{glyph('search')}</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索提交…" /></div>
        <div className="toolbar-right">
          <span className="commit-count"><i />{visibleCommits.length} 个提交</span>
          <span className="divider" />
          <button className="filter-btn" disabled={!selectedRepo} onClick={() => openBranchModal('create')}>{glyph('newb')} 新建分支</button>
          <button className="filter-btn" disabled={!selectedRepo} onClick={() => openBranchModal('switch')}>{glyph('branch')} 切换分支</button>
          <button className="filter-btn" disabled={!selectedRepo} onClick={() => openBranchModal('merge')}>{glyph('merge')} 合并分支</button>
        </div>
      </section>

      <section className="topology-card">
        <div className="card-head">
          <div><h2>{selectedRepo?.name || '请选择一个仓库'}</h2><p>悬停节点查看提交详情，点击节点固定选中</p></div>
          <div className="graph-actions"><span className="view-label">横向拓扑图</span></div>
        </div>
        <div className="legend">
          {branchList.map(b => <span key={b}><i style={{ background: branchColors[b] }} />{b}</span>)}
          {hasUnnamed && <span><i style={{ background: '#8aa5b0' }} />已合并的历史分支</span>}
          <span className="head-legend"><i />HEAD</span>
        </div>
        <div className="graph-viewport">
          {visibleCommits.length === 0
            ? <div className="empty-state">{loading ? '正在加载提交记录…' : '暂无提交记录，请确认仓库路径指向有效的 Git 仓库'}</div>
            : <div className="graph-inner" style={{ width: graphWidth, height: graphHeight }}>
                <svg className="edges" width={graphWidth} height={graphHeight}>
                  {visibleCommits.map(c => {
                    const p = positions[c.id]
                    if (!p) return null
                    return (c.parentIds || []).map(pid => {
                      const parentNode = byFullId[pid]
                      const parent = parentNode ? positions[parentNode.id] : null
                      if (!parent) return null
                      const dx = p.x - parent.x
                      return <path key={`${c.id}-${pid}`} d={`M ${parent.x} ${parent.y} C ${parent.x + dx * 0.45} ${parent.y}, ${p.x - dx * 0.45} ${p.y}, ${p.x} ${p.y}`} fill="none" stroke={p.color} strokeWidth="3" strokeLinecap="round" />
                    })
                  })}
                </svg>
                {visibleCommits.map(c => {
                  const p = positions[c.id]
                  return <div key={c.id} className={`graph-node-wrap ${selectedId === c.id ? 'selected' : ''}`} style={{ left: p.x - 15, top: p.y - 15, '--node-color': p.color }}
                    onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, c })}
                    onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, c })}
                    onMouseLeave={() => setTip(null)}>
                    <button className={`graph-node ${c.isHead ? 'head' : ''}`} onClick={() => setSelectedId(c.id)}><span>{c.isHead ? '✦' : ''}</span></button>
                  </div>
                })}
              </div>}
        </div>
        <div className="graph-foot"><span><b className="key-dot" />当前 HEAD 已高亮</span><span>横向拖动浏览提交历史</span></div>
      </section>

      {selected && <section className="detail-card">
        <div className="detail-head"><h3>提交详情</h3><span className="detail-hash">{selected.fullId}</span></div>
        <div className="detail-meta">
          <div className="detail-field"><span>提交标题</span><b>{selected.title}</b></div>
          <div className="detail-field"><span>作者</span><b>{selected.author}</b></div>
          <div className="detail-field"><span>提交时间</span><b>{formatTime(selected.time)}</b></div>
          <div className="detail-field"><span>所属分支</span><b>{selected.branch || '—'}</b></div>
          <div className="detail-field"><span>短哈希</span><b>{selected.id}</b></div>
          <div className="detail-field"><span>是否 HEAD</span><b>{selected.isHead ? '是' : '否'}</b></div>
        </div>
        {selected.fullMessage && <div className="detail-message">{selected.fullMessage}</div>}
      </section>}

      <section className="changes-card">
        <div className="detail-head">
          <h3>
            <button className="collapse-btn" onClick={() => setChangesOpen(!changesOpen)} title={changesOpen ? '折叠' : '展开'}>{glyph(changesOpen ? 'collapse' : 'expand')}</button>
            工作区变更 <span className="changes-count">{changeFiles.length}</span>
          </h3>
          <div className="changes-actions">
            <button className="filter-btn" disabled={!selectedRepo} onClick={() => selectedRepo && loadStatus(selectedRepo)}>{glyph('refresh')} 刷新状态</button>
            <button className="filter-btn" disabled={!selectedRepo} onClick={() => doStage([...checked])}>{glyph('commit')} 暂存选中</button>
            <button className="filter-btn" disabled={!selectedRepo} onClick={() => doStage([])}>全部暂存</button>
            <button className="filter-btn" disabled={!selectedRepo || stagedCount === 0} onClick={() => doUnstage()}>取消暂存</button>
            <button className="filter-btn" disabled={!selectedRepo || stagedCount === 0} onClick={() => { setCommitMessage(''); setCommitOpen(true) }}>{glyph('commit')} 提交</button>
            <button className="filter-btn" disabled={!selectedRepo} onClick={doStash}>{glyph('stash')} 储藏</button>
            <button className="filter-btn" disabled={!selectedRepo} onClick={doPush}>{glyph('push')} 推送</button>
            <button className="filter-btn" disabled={!selectedRepo} onClick={() => { setConfigForm({ username: '', email: '' }); setConfigOpen(true) }}>{glyph('gear')} 配置</button>
          </div>
        </div>
        {changesOpen && (changeFiles.length === 0
          ? <div className="changes-empty">工作区干净，没有待提交的变更</div>
          : <div className="file-list">
              {changeFiles.map(f => (
                <div key={f.path} className={`file-item ${checked.has(f.path) ? 'checked' : ''}`}>
                  <input type="checkbox" checked={checked.has(f.path)} onChange={() => toggleCheck(f.path)} />
                  <span className="file-path" title="点击查看差异" onClick={() => openDiff(f.path)}>{f.path}</span>
                  <span className={`file-state ${fileStateMeta[f.state].cls}`}>{fileStateMeta[f.state].label}</span>
                  <button className="file-diff" onClick={() => openDiff(f.path)}>查看</button>
                </div>
              ))}
            </div>)}
      </section>
    </main>

    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}>
      <form className="modal" onSubmit={submitForm} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>工作区</span><h2>{editing ? '编辑仓库' : '添加仓库'}</h2></div><button type="button" className="icon-btn" onClick={() => setShowForm(false)}>{glyph('close')}</button></div>
        <label>仓库名称<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：设计系统" /></label>
        <label>本地路径<input value={form.warehousePath} onChange={e => setForm({ ...form, warehousePath: e.target.value })} placeholder="E:\\learncard\\your-repo" /></label>
        <label>远程仓库地址 <small>可选（推送时使用）</small><input value={form.remoteURL} onChange={e => setForm({ ...form, remoteURL: e.target.value })} placeholder="github.com/org/repository" /></label>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setShowForm(false)}>取消</button><button className="primary-btn">{editing ? '保存修改' : '登记仓库'}</button></div>
      </form>
    </div>}

    {branchModal && <div className="modal-backdrop" onClick={() => setBranchModal(null)}>
      <form className="modal branch-modal" onSubmit={submitBranch} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>分支操作</span><h2>{branchModes[branchModal.mode].title}</h2></div><button type="button" className="icon-btn" onClick={() => setBranchModal(null)}>{glyph('close')}</button></div>
        <label>分支名称<input autoFocus value={branchInput} onChange={e => setBranchInput(e.target.value)} placeholder={branchModes[branchModal.mode].placeholder} /></label>
        {branchModal.mode === 'merge' && <div className="hint">源分支将被合并到当前 HEAD 所在分支，冲突时请手动解决。</div>}
        {branchModal.mode === 'create' && <div className="hint">将从当前 HEAD 创建新分支并切换到它（git checkout -b）。</div>}
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setBranchModal(null)}>取消</button><button className="primary-btn">{branchModes[branchModal.mode].action}</button></div>
      </form>
    </div>}

    {commitOpen && <div className="modal-backdrop" onClick={() => setCommitOpen(false)}>
      <form className="modal branch-modal" onSubmit={submitCommit} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>提交</span><h2>提交更改</h2></div><button type="button" className="icon-btn" onClick={() => setCommitOpen(false)}>{glyph('close')}</button></div>
        <label>提交信息<textarea autoFocus rows="4" value={commitMessage} onChange={e => setCommitMessage(e.target.value)} placeholder="描述本次修改内容" /></label>
        <div className="hint">将提交当前已暂存的 {stagedCount} 个文件。</div>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setCommitOpen(false)}>取消</button><button className="primary-btn">提交</button></div>
      </form>
    </div>}

    {configOpen && <div className="modal-backdrop" onClick={() => setConfigOpen(false)}>
      <form className="modal branch-modal" onSubmit={submitConfig} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>配置</span><h2>Git 用户信息</h2></div><button type="button" className="icon-btn" onClick={() => setConfigOpen(false)}>{glyph('close')}</button></div>
        <label>用户名（user.name）<input autoFocus value={configForm.username} onChange={e => setConfigForm({ ...configForm, username: e.target.value })} placeholder="例如：张三" /></label>
        <label>邮箱（user.email）<input value={configForm.email} onChange={e => setConfigForm({ ...configForm, email: e.target.value })} placeholder="例如：zhangsan@example.com" /></label>
        <div className="hint">写入当前仓库的本地配置，提交时会使用这里的用户名和邮箱。</div>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setConfigOpen(false)}>取消</button><button className="primary-btn">保存</button></div>
      </form>
    </div>}

    {diffView && <div className="modal-backdrop" onClick={() => setDiffView(null)}>
      <div className="modal diff-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>文件差异</span><h2>{diffView.path}</h2></div><button type="button" className="icon-btn" onClick={() => setDiffView(null)}>{glyph('close')}</button></div>
        <pre className="diff-view">{diffView.text}</pre>
      </div>
    </div>}

    {tip && (() => {
      const W = 260, H = 122, M = 12
      let left = tip.x + 16
      let top = tip.y + 14
      if (left + W > window.innerWidth - M) left = tip.x - W - 16
      if (top + H > window.innerHeight - M) top = window.innerHeight - H - M
      left = Math.max(M, left)
      top = Math.max(M, top)
      const color = branchColors[tip.c.branch] || '#8aa5b0'
      return <div className="tip" style={{ left, top }}>
        <div className="hover-top"><span style={{ color }}>{tip.c.isHead ? 'HEAD' : (tip.c.branch || tip.c.id)}</span><span>{formatTime(tip.c.time)}</span></div>
        <b>{tip.c.title}</b>
        <div><span>{tip.c.author}</span><span>{tip.c.id}</span></div>
      </div>
    })()}

    {toast && <div className="toast">{toast}</div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)

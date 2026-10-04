import React, { useEffect, useMemo, useRef, useState } from 'react'
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
// 纵向拓扑图尺寸常量：行 = 提交（新在上），列 = 泳道（分支）
const ROW_H = 36
const COL_W = 26
const GRAPH_PAD_TOP = 14
const GRAPH_PAD_LEFT = 24
// 展示层噪音目录：一键忽略时隐藏这些前缀下的变更文件
const TOOL_DIR_PREFIXES = ['.mimosa/']

function isMain(b) { return b === 'main' || b === 'master' }

const fileStateMeta = {
  staged: { label: '已暂存', cls: 'staged' },
  modified: { label: '已修改', cls: 'modified' },
  removed: { label: '已删除', cls: 'removed' },
  untracked: { label: '未跟踪', cls: 'untracked' },
  conflicted: { label: '冲突', cls: 'conflicted' }
}

// unified diff 文本按行着色渲染（+绿 / −红 / @@ 定位 / 文件头弱化）
function DiffLines({ text }) {
  return <pre className="diff-view">
    {text.split('\n').map((line, i) => {
      let cls = ''
      if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls = 'diff-meta'
      else if (line.startsWith('@@')) cls = 'diff-hunk'
      else if (line.startsWith('+')) cls = 'diff-add'
      else if (line.startsWith('-')) cls = 'diff-del'
      return <div key={i} className={`diff-line ${cls}`}>{line || ' '}</div>
    })}
  </pre>
}

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [repos, setRepos] = useState([])
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [commits, setCommits] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)

  // 长耗时 Git 写操作（推送/提交/合并等）的忙碌状态，防止重复点击
  const [busy, setBusy] = useState(false)
  const [busyText, setBusyText] = useState('')
  const busyRef = useRef(false)

  // 悬浮提示框（固定定位，避免被裁剪）
  const [tip, setTip] = useState(null)

  // 工作区变更
  const [status, setStatus] = useState(null)
  const [checked, setChecked] = useState(() => new Set())
  // 变更面板：文件名过滤 + 一键忽略工具目录
  const [changeFilter, setChangeFilter] = useState('')
  const [hideToolFiles, setHideToolFiles] = useState(false)

  // 仓库表单弹窗（新增 / 编辑）
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showToken, setShowToken] = useState(false)
  const [form, setForm] = useState({ name: '', warehousePath: '', remoteURL: '', remoteUsername: '', remoteToken: '' })

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

  // 应用内删除确认弹窗（替代原生 window.confirm）
  const [confirmBox, setConfirmBox] = useState(null)

  // 合并冲突面板（列出冲突文件）
  const [conflictBox, setConflictBox] = useState(null)

  // 提交分页：默认 200 条，「加载更多」每次 +200（后端上限 1000）
  const [limit, setLimit] = useState(200)
  const [hasMore, setHasMore] = useState(false)

  // 拓扑图滚动容器引用，用于加载后自动定位 HEAD
  const viewportRef = useRef(null)  // toast 分级：成功（默认绿色）/ 失败（error 红色，停留更久）
  const notify = (msg, type = 'success') => setToast({ msg, type })
  const notifyErr = msg => setToast({ msg, type: 'error' })
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.type === 'error' ? 4200 : 2600)
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
      notifyErr(e.message || '加载仓库失败')
    }
  }

  async function loadCommits(repo, lim = limit) {
    if (!repo) { setCommits([]); setSelectedId(null); return }
    setLoading(true)
    try {
      const list = await request(`/git/${repo.warehouseId}/commits?limit=${lim}`)
      const arr = Array.isArray(list) ? list : []
      setCommits(arr)
      // 返回条数达到上限说明可能还有更早的提交，允许继续加载
      setHasMore(arr.length >= lim)
      setSelectedId(arr.find(c => c.isHead)?.id || arr[0]?.id || null)
    } catch (e) {
      setCommits([])
      setHasMore(false)
      notifyErr(e.message || '加载提交记录失败')
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

  // 「加载更多」：增大 limit 重新拉取（列表为最新优先，整体替换保证拓扑一致）
  function loadMore() {
    if (!selectedRepo || loading) return
    const next = limit + 200
    setLimit(next)
    loadCommits(selectedRepo, next)
  }

  useEffect(() => { loadRepos() }, [])
  useEffect(() => { if (selectedRepo) refresh(selectedRepo) }, [selectedRepo?.warehouseId])

  // 图加载 / 选中变化后，保证选中行在图视口内可见（仅滚动图容器自身）
  useEffect(() => {
    if (!commits.length) return
    const vp = viewportRef.current
    if (!vp) return
    const el = vp.querySelector('.graph-row-wrap.selected')
    if (!el) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < vp.scrollTop + 8) vp.scrollTop = top - 8
    else if (bottom > vp.scrollTop + vp.clientHeight - 8) vp.scrollTop = bottom - vp.clientHeight + 8
  }, [commits, selectedId])

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

  // 纵向布局坐标：行号 = 可见提交顺序（新在上），x 由泳道号决定
  const positions = useMemo(() => {
    const map = {}
    visibleCommits.forEach((c, i) => {
      map[c.id] = {
        row: i,
        x: GRAPH_PAD_LEFT + (c.lane ?? 0) * COL_W,
        y: GRAPH_PAD_TOP + i * ROW_H + ROW_H / 2,
        color: branchColors[c.branch] || '#8aa5b0'
      }
    })
    return map
  }, [visibleCommits, branchColors])

  const byFullId = useMemo(() => Object.fromEntries(commits.map(c => [c.fullId, c])), [commits])

  // 画布尺寸：高度随提交行数自适应，宽度 = 泳道区 + 行信息区（各列固定基准宽）
  const laneAreaWidth = GRAPH_PAD_LEFT + (maxLane + 1) * COL_W
  const graphWidth = Math.max(720, laneAreaWidth + 820)
  const graphHeight = GRAPH_PAD_TOP * 2 + Math.max(visibleCommits.length, 8) * ROW_H
  const selected = commits.find(c => c.id === selectedId) || commits[0] || null
  const hasUnnamed = useMemo(() => commits.some(c => !c.branch), [commits])
  // HEAD 所在分支（用于合并时排除自身、展示当前分支提示）
  const currentBranch = commits.find(c => c.isHead)?.branch || ''

  // 键盘 ↑/↓ 在提交列表中移动选中（弹窗打开或焦点在输入框时忽略）
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (showForm || branchModal || commitOpen || configOpen || diffView || confirmBox || conflictBox || busy) return
      if (!visibleCommits.length) return
      e.preventDefault()
      const idx = visibleCommits.findIndex(c => c.id === selectedId)
      const next = e.key === 'ArrowUp'
        ? Math.max(0, idx <= 0 ? 0 : idx - 1)
        : Math.min(visibleCommits.length - 1, idx === -1 ? 0 : idx + 1)
      setSelectedId(visibleCommits[next].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visibleCommits, selectedId, showForm, branchModal, commitOpen, configOpen, diffView, confirmBox, conflictBox, busy])

  // 工作区变更的文件清单（含合并冲突文件）
  const changeFiles = useMemo(() => {
    if (!status) return []
    return [
      ...(status.conflicted || []).map(p => ({ path: p, state: 'conflicted' })),
      ...(status.staged || []).map(p => ({ path: p, state: 'staged' })),
      ...(status.modified || []).map(p => ({ path: p, state: 'modified' })),
      ...(status.removed || []).map(p => ({ path: p, state: 'removed' })),
      ...(status.untracked || []).map(p => ({ path: p, state: 'untracked' }))
    ]
  }, [status])

  // 展示层过滤：文件名关键字 + 忽略工具目录前缀
  const visibleChangeFiles = useMemo(() => {
    let list = changeFiles
    if (hideToolFiles) list = list.filter(f => !TOOL_DIR_PREFIXES.some(p => f.path.startsWith(p)))
    const kw = changeFilter.trim().toLowerCase()
    if (kw) list = list.filter(f => f.path.toLowerCase().includes(kw))
    return list
  }, [changeFiles, changeFilter, hideToolFiles])

  // 按状态分组（固定顺序），用于分组渲染与分组勾选
  const changeGroups = useMemo(() => {
    const order = [['conflicted', '冲突'], ['staged', '已暂存'], ['modified', '已修改'], ['removed', '已删除'], ['untracked', '未跟踪']]
    return order
      .map(([state, label]) => ({ state, label, files: visibleChangeFiles.filter(f => f.state === state) }))
      .filter(g => g.files.length > 0)
  }, [visibleChangeFiles])

  function toggleCheck(path) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // 分组头复选框：整组勾选 / 取消勾选
  function toggleGroup(files, checkAll) {
    setChecked(prev => {
      const next = new Set(prev)
      files.forEach(f => checkAll ? next.add(f.path) : next.delete(f.path))
      return next
    })
  }

  // ---- 仓库增删改查 ----
  function openCreate() {
    setEditing(false)
    setEditingId(null)
    setForm({ name: '', warehousePath: '', remoteURL: '', remoteUsername: '', remoteToken: '' })
    setShowForm(true)
  }
  function openEdit(repo) {
    setEditing(true)
    setEditingId(repo.warehouseId)
    setForm({ name: repo.name, warehousePath: repo.warehousePath, remoteURL: repo.remoteURL || '', remoteUsername: repo.remoteUsername || '', remoteToken: repo.remoteToken || '' })
    setShowForm(true)
  }
  // 通用剪贴板复制（提交哈希、Token 等用户主动复制的场景）
  function copyText(text, okMsg = '已复制') {
    if (!text) { notifyErr('内容为空'); return }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => notify(okMsg)).catch(() => notifyErr('复制失败，请手动选择复制'))
    } else {
      notifyErr('当前环境不支持一键复制，请手动选择复制')
    }
  }
  async function submitForm(e) {
    e.preventDefault()
    if (!form.name || !form.warehousePath) { notifyErr('请填写仓库名称和本地路径'); return }
    try {
      if (editing) {
        const updated = await request(`/warehouse/${editingId}`, {
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
      notifyErr(err.message || '操作失败')
    }
  }
  // 删除仓库：改为应用内确认弹窗，确认后执行真正删除
  function removeRepo(repo) {
    setConfirmBox({
      title: '删除仓库',
      text: `确定删除仓库「${repo.name}」吗？仅解除登记，不会删除本地目录，此操作不可恢复。`,
      onOk: async () => {
        try {
          await request(`/warehouse/${repo.warehouseId}`, { method: 'DELETE' })
          notify('仓库已删除')
          setSelectedRepo(null)
          await loadRepos(false)
        } catch (err) {
          notifyErr(err.message || '删除失败')
        } finally {
          setConfirmBox(null)
        }
      }
    })
  }

  // ---- Git 操作 ----
  // 忙碌保护：同一时间只允许一个 Git 写操作，重复点击直接丢弃（不排队）
  function startBusy(text) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setBusyText(text)
    return true
  }
  function endBusy() {
    busyRef.current = false
    setBusy(false)
    setBusyText('')
  }

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
    if (!branchInput.trim()) { notifyErr('请输入分支名称'); return }
    const { mode } = branchModal
    const cfg = branchModes[mode]
    if (!selectedRepo || !cfg) return
    if (!startBusy('操作中，请稍候…')) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/${cfg.path}?${cfg.param}=${encodeURIComponent(branchInput.trim())}`, { method: 'POST' })
      notify(`${cfg.done}「${branchInput.trim()}」`)
      setBranchModal(null)
      refresh(selectedRepo)
    } catch (err) {
      notifyErr(err.message || '操作失败')
      // 合并失败后立即刷新工作区状态；若存在冲突文件则打开冲突面板指引解决
      if (mode === 'merge') {
        setBranchModal(null)
        try {
          const s = await request(`/git/${selectedRepo.warehouseId}/status`)
          setStatus(s || null) // 同步回变更面板，冲突文件立刻可见
          if (s && (s.conflicted || []).length) setConflictBox({ files: s.conflicted })
        } catch { /* 状态读取失败时忽略，仅保留错误提示 */ }
      }
    } finally {
      endBusy()
    }
  }

  async function postJson(path, body, okMsg, failMsg, thenRefresh) {
    try {
      await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      notify(okMsg)
      if (thenRefresh) refresh(selectedRepo)
      else loadStatus(selectedRepo)
    } catch (err) {
      notifyErr(err.message ||failMsg)
    }
  }

  function doStage(paths) {
    if (!selectedRepo) return
    if (paths && paths.length === 0) { notifyErr('请先勾选要暂存的文件'); return }
    postJson(`/git/${selectedRepo.warehouseId}/stage`, paths, paths.length ? '已暂存选中文件' : '已暂存全部变更', '暂存失败', false)
    setChecked(new Set())
  }
  function doUnstage() {
    if (!selectedRepo) return
    const paths = [...checked]
    if (paths.length === 0) { notifyErr('请先勾选要取消暂存的文件'); return }
    postJson(`/git/${selectedRepo.warehouseId}/unstage`, paths, '已取消暂存', '取消暂存失败', false)
    setChecked(new Set())
  }

  async function submitCommit(e) {
    e.preventDefault()
    if (!commitMessage.trim()) { notifyErr('请输入提交信息'); return }
    if (!selectedRepo) return
    if (!startBusy('提交中，请稍候…')) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/commit?message=${encodeURIComponent(commitMessage.trim())}`, { method: 'POST' })
      notify('提交成功')
      setCommitOpen(false)
      setCommitMessage('')
      refresh(selectedRepo)
    } catch (err) {
      notifyErr(err.message ||'提交失败')
    } finally {
      endBusy()
    }
  }
  async function doStash() {
    if (!selectedRepo) return
    if (!startBusy('储藏中，请稍候…')) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/stash`, { method: 'POST' })
      notify('已储藏当前修改')
      refresh(selectedRepo)
    } catch (err) {
      notifyErr(err.message ||'储藏失败')
    } finally {
      endBusy()
    }
  }
  async function doStashPop() {
    if (!selectedRepo) return
    if (!startBusy('恢复储藏中，请稍候…')) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/stash/pop`, { method: 'POST' })
      notify('已恢复最近一次储藏')
      refresh(selectedRepo)
    } catch (err) {
      notifyErr(err.message ||'恢复储藏失败')
    } finally {
      endBusy()
    }
  }
  async function doPush() {
    if (!selectedRepo) return
    if (!startBusy('推送中，请稍候…')) return
    try {
      await request(`/git/${selectedRepo.warehouseId}/push`, { method: 'POST' })
      notify('推送成功')
    } catch (err) {
      notifyErr(err.message ||'推送失败')
    } finally {
      endBusy()
    }
  }
  async function openDiff(path) {
    if (!selectedRepo) return
    try {
      const text = await request(`/git/${selectedRepo.warehouseId}/diff?path=${encodeURIComponent(path)}`)
      setDiffView({ path, text: text || '（该文件没有可显示的差异）' })
    } catch (err) {
      notifyErr(err.message ||'读取差异失败')
    }
  }
  async function submitConfig(e) {
    e.preventDefault()
    if (!selectedRepo) return
    if (!configForm.username.trim() && !configForm.email.trim()) { notifyErr('请填写用户名或邮箱'); return }
    const q = new URLSearchParams()
    if (configForm.username.trim()) q.set('username', configForm.username.trim())
    if (configForm.email.trim()) q.set('email', configForm.email.trim())
    try {
      await request(`/git/${selectedRepo.warehouseId}/config?${q.toString()}`, { method: 'POST' })
      notify('配置已保存')
      setConfigOpen(false)
    } catch (err) {
      notifyErr(err.message ||'配置失败')
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
          <button className="nav-item" onClick={() => selectedRepo && refresh(selectedRepo)}><span>{glyph('refresh')}</span><span>刷新数据</span></button>
          <div className="profile"><div className="avatar">GV</div><span><b>开发者</b><small>维护者</small></span></div>
        </div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div>
          <div className="breadcrumbs"><span>工作区</span><b>/</b><strong>{selectedRepo?.name || '未选择'}</strong>{currentBranch && <span className="branch-pill">{currentBranch}</span>}</div>
          <h1>仓库拓扑图</h1>
        </div>
        <div className="top-actions">
          <button className="outline-btn" onClick={() => selectedRepo && refresh(selectedRepo)}>{glyph('refresh')} 刷新</button>
          <button className="primary-btn" onClick={openCreate}>{glyph('plus')} 添加仓库</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="search"><span>{glyph('search')}</span><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Escape' && setSearch('')} placeholder="搜索提交…" />
          {search && <button type="button" className="search-clear" title="清空搜索" onClick={() => setSearch('')}>{glyph('close')}</button>}
        </div>
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
          <div><h2>{selectedRepo?.name || '请选择一个仓库'}</h2><p>点击行选中提交，↑/↓ 键切换，悬停查看详情</p></div>
          <div className="graph-actions"><span className="view-label">纵向拓扑图</span></div>
        </div>
        <div className="legend">
          {branchList.map(b => <span key={b}><i style={{ background: branchColors[b] }} />{b}</span>)}
          {hasUnnamed && <span><i style={{ background: '#8aa5b0' }} />已合并的历史分支</span>}
          <span className="head-legend"><i />HEAD</span>
        </div>
        <div className="graph-viewport" ref={viewportRef}>
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
                      if (!parent) {
                        // 父提交不在当前筛选/加载范围：向下方（更旧方向）画虚线，明示连线被截断而非消失
                        return <path key={`${c.id}-${pid}-out`} d={`M ${p.x} ${p.y} V ${graphHeight}`} fill="none" stroke={p.color} strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" opacity="0.5" />
                      }
                      // 纵向 S 曲线：父提交（更旧、在下方）连向子提交
                      const dy = parent.y - p.y
                      return <path key={`${c.id}-${pid}`} d={`M ${parent.x} ${parent.y} C ${parent.x} ${parent.y - dy * 0.4}, ${p.x} ${p.y + dy * 0.4}, ${p.x} ${p.y}`} fill="none" stroke={p.color} strokeWidth="2" strokeLinecap="round" />
                    })
                  })}
                </svg>
                {visibleCommits.map(c => {
                  const p = positions[c.id]
                  const cls = `graph-row-wrap ${selectedId === c.id ? 'selected' : ''}`
                  return <div key={c.id} className={cls} style={{ top: GRAPH_PAD_TOP + p.row * ROW_H, height: ROW_H, '--lane-pad': `${laneAreaWidth}px` }}
                    onClick={() => setSelectedId(c.id)}
                    onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, c })}
                    onMouseMove={e => setTip({ x: e.clientX, y: e.clientY, c })}
                    onMouseLeave={() => setTip(null)}>
                    <span className={`graph-node-row ${c.isHead ? 'head' : ''}`} style={{ left: p.x, '--node-color': p.color }} />
                    <span className="row-hash">{c.id}</span>
                    <span className="row-title">{c.title}</span>
                    {c.isHead && <span className="row-head-badge">HEAD</span>}
                    <span className="row-branch"><i style={{ background: p.color }} />{c.branch || '—'}</span>
                    <span className="row-author">{c.author}</span>
                    <span className="row-time">{formatTime(c.time)}</span>
                  </div>
                })}
              </div>}
        </div>
        <div className="graph-foot">
          <span><b className="key-dot" />当前 HEAD 已高亮，虚线表示父提交在当前筛选范围外</span>
          {commits.length === 0
            ? <span>共 0 条提交</span>
            : hasMore
              ? <button className="filter-btn" disabled={loading} onClick={loadMore}>{loading ? '加载中…' : `加载更早的提交（已显示 ${commits.length} 条）`}</button>
              : <span>已加载全部 {commits.length} 条提交</span>}
        </div>
      </section>

      {selected && <section className="detail-card">
        <div className="detail-head"><h3>提交详情</h3><button className="detail-hash copy-hash" title="点击复制完整哈希" onClick={() => copyText(selected.fullId, '已复制提交哈希')}>{selected.fullId}</button></div>
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
          : <>
              <div className="changes-toolbar">
                <div className="changes-filter">
                  <span>{glyph('search')}</span>
                  <input value={changeFilter} onChange={e => setChangeFilter(e.target.value)} onKeyDown={e => e.key === 'Escape' && setChangeFilter('')} placeholder="过滤文件名…" />
                  {changeFilter && <button type="button" className="filter-clear" title="清空过滤" onClick={() => setChangeFilter('')}>{glyph('close')}</button>}
                </div>
                <label className="tool-toggle" title="隐藏 .mimosa/ 等工具生成的变更，仅影响显示">
                  <input type="checkbox" checked={hideToolFiles} onChange={e => setHideToolFiles(e.target.checked)} />
                  忽略工具目录（.mimosa/）
                </label>
                <span className="changes-shown">显示 {visibleChangeFiles.length} / {changeFiles.length} 个文件</span>
              </div>
              {visibleChangeFiles.length === 0
                ? <div className="changes-empty">没有匹配的变更文件，试试调整过滤条件</div>
                : <div className="file-list">
                    {changeGroups.map(g => [
                      <div key={`head-${g.state}`} className={`group-head state-${g.state}`}>
                        <input type="checkbox" title="勾选/取消整组"
                          checked={g.files.every(f => checked.has(f.path))}
                          onChange={e => toggleGroup(g.files, e.target.checked)} />
                        <span className="group-label">{g.label}</span>
                        <em>{g.files.length}</em>
                      </div>,
                      ...g.files.map(f => (
                        <div key={f.path} className={`file-item ${checked.has(f.path) ? 'checked' : ''}`}>
                          <input type="checkbox" checked={checked.has(f.path)} onChange={() => toggleCheck(f.path)} />
                          <span className="file-path" title="点击查看差异" onClick={() => openDiff(f.path)}>{f.path}</span>
                          <span className={`file-state ${fileStateMeta[f.state].cls}`}>{fileStateMeta[f.state].label}</span>
                          <button className="file-diff" onClick={() => openDiff(f.path)}>查看</button>
                        </div>
                      ))
                    ])}
                  </div>}
            </>)}
      </section>
    </main>

    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}>
      <form className="modal" onSubmit={submitForm} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>工作区</span><h2>{editing ? '编辑仓库' : '添加仓库'}</h2></div><button type="button" className="icon-btn" onClick={() => setShowForm(false)}>{glyph('close')}</button></div>
        <label>仓库名称<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：设计系统" /></label>
        <label>本地路径<input value={form.warehousePath} onChange={e => setForm({ ...form, warehousePath: e.target.value })} placeholder="E:\\learncard\\your-repo" /></label>
        <label>远程仓库地址 <small>可选（推送时使用）</small><input value={form.remoteURL} onChange={e => setForm({ ...form, remoteURL: e.target.value })} placeholder="github.com/org/repository" /></label>
        <label>远程仓库用户名 <small>可选（推送时使用）</small><input value={form.remoteUsername} onChange={e => setForm({ ...form, remoteUsername: e.target.value })} placeholder="GitHub 用户名" /></label>
        <label>访问令牌 Token <small>推私库必填</small>
          <div className="token-input">
            <input type={showToken ? 'text' : 'password'} autoComplete="new-password" value={form.remoteToken} onChange={e => setForm({ ...form, remoteToken: e.target.value })} placeholder="ghp_xxx（Personal Access Token）" />
            <button type="button" className="token-toggle" onClick={e => { e.preventDefault(); setShowToken(s => !s) }}>{showToken ? '隐藏' : '显示'}</button>
            <button type="button" className="token-toggle" onClick={e => { e.preventDefault(); copyText(form.remoteToken, 'Token 已复制') }}>复制</button>
          </div>
        </label>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setShowForm(false)}>取消</button><button className="primary-btn">{editing ? '保存修改' : '登记仓库'}</button></div>
      </form>
    </div>}

    {branchModal && (() => {
      const cfg = branchModes[branchModal.mode]
      // 切换/合并时提供已有分支的候选下拉（datalist 原生过滤，仍允许手输）；合并排除当前分支
      const choices = branchModal.mode === 'create'
        ? []
        : branchList.filter(b => branchModal.mode !== 'merge' || b !== currentBranch)
      return <div className="modal-backdrop" onClick={() => setBranchModal(null)}>
        <form className="modal branch-modal" onSubmit={submitBranch} onClick={e => e.stopPropagation()}>
          <div className="modal-head"><div><span>分支操作</span><h2>{cfg.title}</h2></div><button type="button" className="icon-btn" onClick={() => setBranchModal(null)}>{glyph('close')}</button></div>
          <label>分支名称
            <input autoFocus value={branchInput} onChange={e => setBranchInput(e.target.value)} placeholder={cfg.placeholder} list={choices.length ? 'branch-options' : undefined} />
            {choices.length > 0 && <datalist id="branch-options">
              {choices.map(b => <option key={b} value={b} />)}
            </datalist>}
          </label>
          {branchModal.mode !== 'create' && <div className="hint">当前分支：{currentBranch || '未知（HEAD 处于游离或合并状态）'}</div>}
          {branchModal.mode === 'merge' && <div className="hint">源分支将被合并到当前分支，冲突时请按冲突面板指引处理。</div>}
          {branchModal.mode === 'create' && <div className="hint">将从当前 HEAD 创建新分支并切换到它（git checkout -b）。</div>}
          <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setBranchModal(null)}>取消</button><button className="primary-btn">{cfg.action}</button></div>
        </form>
      </div>
    })()}

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
        <DiffLines text={diffView.text} />
      </div>
    </div>}

    {confirmBox && <div className="modal-backdrop" onClick={() => setConfirmBox(null)}>
      <div className="modal branch-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>确认操作</span><h2>{confirmBox.title}</h2></div><button type="button" className="icon-btn" onClick={() => setConfirmBox(null)}>{glyph('close')}</button></div>
        <div className="confirm-text">{confirmBox.text}</div>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setConfirmBox(null)}>取消</button><button className="primary-btn danger-btn" onClick={confirmBox.onOk}>确认删除</button></div>
      </div>
    </div>}

    {conflictBox && <div className="modal-backdrop" onClick={() => setConflictBox(null)}>
      <div className="modal diff-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><span>合并冲突</span><h2>检测到 {conflictBox.files.length} 个冲突文件</h2></div><button type="button" className="icon-btn" onClick={() => setConflictBox(null)}>{glyph('close')}</button></div>
        <div className="confirm-text">Git 已在下列文件中写入冲突标记。点击「查看冲突」定位差异，手动编辑解决后，在工作区变更面板勾选这些文件暂存并提交，即可完成本次合并。</div>
        <div className="file-list">
          {conflictBox.files.map(p => (
            <div key={p} className="file-item">
              <span className="file-path">{p}</span>
              <button className="file-diff" onClick={() => openDiff(p)}>查看冲突</button>
            </div>
          ))}
        </div>
        <div className="modal-actions"><button className="primary-btn" onClick={() => setConflictBox(null)}>知道了</button></div>
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

    {busy && <div className="modal-backdrop busy-backdrop">
      <div className="busy-box">
        <div className="spinner" />
        <p>{busyText}</p>
      </div>
    </div>}

    {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)

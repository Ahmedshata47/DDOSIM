import React, { useRef, useEffect, useCallback } from 'react'
import * as d3 from 'd3'

export default function NetworkCanvas({ networkData, packets, simState }) {
  const svgRef = useRef(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const simRef = useRef(null)
  const mainGroupRef = useRef(null)
  const zoomBehaviorRef = useRef(null)
  const particlesRef = useRef([])
  const dyingRef = useRef([])
  const flashesRef = useRef([])
  const rafRef = useRef(null)
  const lastIdRef = useRef(null)
  const MAX_PARTICLES = 200

  const getNodeColor = useCallback((id) => {
    if (id === 'server') return '#3fb950'
    if (id === 'router') return '#d29922'
    if (id?.startsWith('bot')) return '#ff3b3b'
    return '#58a6ff'
  }, [])

  const getNodeLabel = useCallback((id) => {
    if (id === 'server') return 'Server'
    if (id === 'router') return 'Router'
    if (id?.startsWith('bot')) return 'Bot'
    return 'Client'
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'coloredBlur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const mainGroup = svg.append('g').attr('class', 'main')
    mainGroup.append('g').attr('class', 'links')
    mainGroup.append('g').attr('class', 'nodes')
    mainGroupRef.current = mainGroup

    zoomBehaviorRef.current = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => mainGroup.attr('transform', event.transform))
    svg.call(zoomBehaviorRef.current)
    svg.on('dblclick.zoom', null)

    return () => simRef.current?.stop()
  }, [])

  useEffect(() => {
    if (!mainGroupRef.current || !containerRef.current) return
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight
    const linkGroup = mainGroupRef.current.select('g.links')
    const nodeGroup = mainGroupRef.current.select('g.nodes')

    if (!networkData.server && !networkData.router) {
      linkGroup.selectAll('*').remove()
      nodeGroup.selectAll('*').remove()
      if (simRef.current) {
        simRef.current.nodes([])
        simRef.current.force('link').links([])
        simRef.current.stop()
        simRef.current = null
      }
      return
    }

    const serverNode = networkData.server ? { ...networkData.server, type: 'server' } : null
    const routerNode = networkData.router ? { ...networkData.router, type: 'router' } : null
    const attackerNodes = (networkData.attackers || []).map(a => ({ ...a, type: 'bot' }))
    const newNodes = [serverNode, routerNode, ...attackerNodes].filter(Boolean)

    const existingIds = new Set((simRef.current?.nodes() || []).map(n => n.id))
    const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id))

    const allNodes = simRef.current ? [...simRef.current.nodes()] : []
    for (const n of nodesToAdd) {
      n.x = width / 2 + (Math.random() - 0.5) * 200
      n.y = height / 2 + (Math.random() - 0.5) * 200
      allNodes.push(n)
    }

    const router = allNodes.find(n => n.type === 'router') || allNodes.find(n => n.type === 'server')
    const server = allNodes.find(n => n.type === 'server')
    const bots = allNodes.filter(n => n.type === 'bot')
    const newLinks = []
    if (server && router) newLinks.push({ source: router.id, target: server.id })
    for (const bot of bots) {
      newLinks.push({ source: bot.id, target: router ? router.id : server?.id })
    }

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(allNodes)
        .force('link', d3.forceLink(newLinks).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(40))
    } else {
      simRef.current.nodes(allNodes)
      simRef.current.force('link').links(newLinks)
      simRef.current.alpha(0.3).restart()
    }

    const linkElements = linkGroup.selectAll('line')
      .data(newLinks, d => `${d.source}-${d.target}`)
      .join('line')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)

    const nodeElements = nodeGroup.selectAll('g')
      .data(allNodes, d => d.id)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )

    nodeElements.selectAll('circle').data(d => [d]).join('circle')
      .attr('r', 28)
      .attr('fill', d => getNodeColor(d.id))
      .attr('stroke', d => getNodeColor(d.id))
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.5)
      .attr('filter', 'url(#glow)')

    nodeElements.selectAll('text').data(d => [d]).join('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('fill', '#fff')
      .text(d => getNodeLabel(d.id))

    nodeElements.selectAll('title').data(d => [d]).join('title')
      .text(d => `${d.id}\n${d.ip || ''}`)

    simRef.current.on('tick', () => {
      linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
      nodeElements.attr('transform', d => `translate(${d.x},${d.y})`)
    })
  }, [networkData, getNodeColor, getNodeLabel])

  useEffect(() => {
    if (!simRef.current || !packets.length) return
    const nodes = simRef.current.nodes()
    const pkt = packets[0]
    if (!pkt || pkt.packet_id === lastIdRef.current) return
    lastIdRef.current = pkt.packet_id

    const src = nodes.find(n => n.id === pkt.source_id)
    const dst = nodes.find(n => n.id === pkt.destination_id)
    const router = nodes.find(n => n.id === 'router')
    if (!src || !dst) return

    if (particlesRef.current.length >= MAX_PARTICLES) {
      const oldest = particlesRef.current.shift()
      if (oldest) dyingRef.current.push({ ...oldest, opacity: 1 })
    }

    const isDropped = pkt.dropped === true
    const target = isDropped && router ? router : dst

    const speed = 0.015 + Math.random() * 0.01
    particlesRef.current.push({
      x: src.x, y: src.y,
      startX: src.x, startY: src.y,
      endX: target.x, endY: target.y,
      progress: 0,
      speed,
      color: pkt.is_attack_predicted ? '#ff3b3b' : '#3fb950',
      radius: pkt.is_attack_predicted ? 3 : 2,
      attack: pkt.is_attack_predicted,
      hitServer: !isDropped && pkt.is_attack_predicted && dst.id === 'server',
      isDropped,
      droppedColor: '#8b949e',
    })
  }, [packets])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function render(time) {
      const w = containerRef.current?.clientWidth || 800
      const h = containerRef.current?.clientHeight || 600
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      ctx.clearRect(0, 0, w, h)

      let zoomX = 0, zoomY = 0, zoomK = 1
      if (svgRef.current) {
        const t = d3.zoomTransform(d3.select(svgRef.current).node())
        zoomX = t.x; zoomY = t.y; zoomK = t.k
      }

      ctx.save()
      ctx.translate(zoomX, zoomY)
      ctx.scale(zoomK, zoomK)

      const active = []
      for (const p of particlesRef.current) {
        p.progress += p.speed
        if (p.progress >= 1) {
          if (p.hitServer) {
            flashesRef.current.push({ x: p.endX, y: p.endY, radius: 30, maxRadius: 60, opacity: 0.6, life: 0 })
          }
          continue
        }
        p.x = p.startX + (p.endX - p.startX) * p.progress
        p.y = p.startY + (p.endY - p.startY) * p.progress

        const drawColor = p.isDropped ? '#8b949e' : p.color
        const opacity = p.isDropped ? 1 - p.progress * 0.7 : 1
        ctx.globalAlpha = opacity
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = drawColor
        ctx.shadowBlur = 10
        ctx.shadowColor = drawColor
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1

        active.push(p)
      }
      particlesRef.current = active

      const aliveDying = []
      for (const d of dyingRef.current) {
        d.opacity -= 0.02
        d.progress += d.speed * 0.5
        if (d.opacity <= 0) continue
        d.x = d.startX + (d.endX - d.startX) * d.progress
        d.y = d.startY + (d.endY - d.startY) * d.progress
        const r = d.radius * (0.3 + 0.7 * d.opacity)
        ctx.globalAlpha = d.opacity
        ctx.beginPath()
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.fillStyle = d.color
        ctx.fill()
        aliveDying.push(d)
      }
      ctx.globalAlpha = 1
      dyingRef.current = aliveDying

      const activeFlashes = []
      for (const f of flashesRef.current) {
        f.life += 0.04
        if (f.life >= 1) continue
        f.radius = 30 + (f.maxRadius - 30) * f.life
        const a = 0.6 * (1 - f.life)
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 59, 59, ${a})`
        ctx.lineWidth = 2
        ctx.stroke()
        activeFlashes.push(f)
      }
      flashesRef.current = activeFlashes

      ctx.restore()
    }

    let running = true
    function loop(time) {
      if (!running) return
      render(time)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const zoomIn = () => {
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.4)
  }

  const zoomOut = () => {
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7)
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-dark-800 overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #58a6ff 1px, transparent 0)',
        backgroundSize: '40px 40px',
      }} />
      <svg ref={svgRef} width="100%" height="100%" className="relative z-10" />
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1">
        <button onClick={zoomIn} className="bg-dark-600 hover:bg-dark-500 text-dark-200 rounded w-7 h-7 flex items-center justify-center text-sm font-mono border border-dark-400">+</button>
        <button onClick={zoomOut} className="bg-dark-600 hover:bg-dark-500 text-dark-200 rounded w-7 h-7 flex items-center justify-center text-sm font-mono border border-dark-400">-</button>
      </div>

      {(!networkData.server && !networkData.router) && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center">
            <div className="text-4xl mb-3">🛡️</div>
            <p className="text-dark-300 text-sm font-mono">Configure and start a simulation to see the network</p>
          </div>
        </div>
      )}
    </div>
  )
}
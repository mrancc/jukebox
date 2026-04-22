// ── 队列渲染 ─────────────────────────────────────────────────
function renderQueue() {
  const list = document.getElementById('queue-list');
  document.getElementById('qc').textContent = state.queue.length;
  if (!state.queue.length) {
    list.innerHTML = '<div class="qempty"><div class="bi">🎧</div>队列空空如也<br/>快去搜索点歌吧！</div>';
    return;
  }
  list.innerHTML = state.queue.map((s, i) => {
    const cur = i === state.currentIndex;
    const dragAttr = (isAdmin && !cur) ? `draggable="true" data-qi="${i}"` : '';
    return `<div class="qi ${cur ? 'cur' : ''}" ${dragAttr}>
      <div class="qnum ${cur && state.isPlaying ? 'play' : ''}">${cur ? '♫' : i + 1}</div>
      ${s.cover
            ? `<img class="qcover" src="${s.cover}" onerror="this.outerHTML='<div class=qcover-ph>🎵</div>'" alt="">`
            : `<div class="qcover-ph">🎵</div>`}
      <div class="qinfo"><div class="qname">${esc(s.name)}</div><div class="qsub">${esc(s.artist)}</div></div>
      <span class="qreq">${esc(s.requester)}</span>
      <button class="btn-del" onclick="removeSong(${s.uid})">✕</button>
    </div>`;
  }).join('');
  const curEl = list.querySelector('.cur');
  if (curEl) curEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (isAdmin) initDragSort(list);
}

// ── 拖拽排序 ─────────────────────────────────────────────────
function initDragSort(container) {
  let dragSrcIndex = null;

  container.querySelectorAll('[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', function (e) {
      dragSrcIndex = parseInt(this.dataset.qi);
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSrcIndex);
    });

    el.addEventListener('dragend', function () {
      this.classList.remove('dragging');
      container.querySelectorAll('.qi').forEach(item => item.classList.remove('drag-over'));
      dragSrcIndex = null;
    });

    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.qi').forEach(item => item.classList.remove('drag-over'));
      this.classList.add('drag-over');
    });

    el.addEventListener('dragleave', function () {
      this.classList.remove('drag-over');
    });

    el.addEventListener('drop', function (e) {
      e.preventDefault();
      this.classList.remove('drag-over');
      const toIndex = parseInt(this.dataset.qi);
      if (dragSrcIndex !== null && dragSrcIndex !== toIndex) {
        socket.emit('reorder_queue', {
          fromIndex: dragSrcIndex,
          toIndex: toIndex,
          nickname: getNick(),
        });
      }
    });
  });
}

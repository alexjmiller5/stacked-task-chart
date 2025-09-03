document.addEventListener('DOMContentLoaded', async function () {
  // --- Element Cache ---
  const chartContainer = document.getElementById('chart-container');
  const loaderContainer = document.getElementById('loader-container');
  const groupBySwitcher = document.getElementById('group-by-switcher');
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  const includeIncompleteToggle = document.getElementById('include-incomplete-toggle');
  const includeLegacyToggle = document.getElementById('legacy-view-toggle');
  const prevMonthButton = document.getElementById('prev-month');
  const nextMonthButton = document.getElementById('next-month');

  const tagFilterContainer = document.getElementById('tag-filter-container');
  const tagDropdownButton = document.getElementById('tag-dropdown-button');
  const tagDropdownPanel = document.getElementById('tag-dropdown-panel');
  const tagListContainer = document.getElementById('tag-list-container');
  const tagDropdownLabel = document.getElementById('tag-dropdown-label');

  const statusFilterContainer = document.getElementById('status-filter-container');
  const statusDropdownButton = document.getElementById('status-dropdown-button');
  const statusDropdownPanel = document.getElementById('status-dropdown-panel');
  const statusListContainer = document.getElementById('status-list-container');
  const statusDropdownLabel = document.getElementById('status-dropdown-label');

  // --- App State ---
  const myChart = echarts.init(chartContainer);
  let rawData = [];
  let allFetchedPages = [];
  let events = new Map();
  let minDate = dayjs().startOf('day');

  let state = {
    groupBy: 'tag', // 'tag' or 'dueDate'
    dateRange: { start: dayjs().subtract(3, 'month').format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') },
    selectedTags: new Set(),
    selectedDueDateStatuses: new Set(),
    allTags: [],
    allDueDateStatuses: ['Future', 'Overdue', 'Undated'],
    includeIncomplete: true,
    includeLegacyTasks: false,
  };

  includeLegacyToggle.checked = state.includeLegacyTasks;

  // --- Core Data Processing Functions ---

  function getCalculationLimitDate() {
    const today = dayjs().format('YYYY-MM-DD');
    const viewEndDate = state.dateRange.end;
    return dayjs(viewEndDate).isAfter(today) ? viewEndDate : today;
  }

  function prepareTasksAndEvents(pages) {
    const allTags = new Set();
    const tasks = pages.map((page) => {
      const props = page.properties;
      const getProp = (name, type, sub) => props[name]?.[type]?.[sub] ?? props[name]?.[type];
      const getMultiSelect = (name) => (props[name]?.multi_select || []).map(t => t.name);
      const getRichText = (name) => (props[name]?.rich_text[0]?.plain_text || '');
      const tags = getMultiSelect('Tags') || getMultiSelect('Tag');
      tags.forEach(tag => allTags.add(tag));
      return {
        id: page.id,
        created: getProp('Date Created', 'created_time'),
        completed: getProp('Completed Date', 'date', 'start'),
        dueDate: getProp('Due Date', 'date', 'start'),
        status: getProp('Status', 'status', 'name'),
        tags: tags,
        historyText: getRichText('Tag & Date History'),
        isUseless: tags.includes('useless'),
      };
    }).filter(task => {
      const baseFilter = task.created && task.status !== 'Cancelled' && !task.isUseless;
      const legacyFilter = state.includeLegacyTasks || dayjs(task.created).isAfter('2025-01-10');
      const incompleteFilter = state.includeIncomplete ? baseFilter : baseFilter && task.completed;
      return baseFilter && legacyFilter && incompleteFilter;
    }).map((task) => ({
      ...task,
      history: parseHistoryLedger(task.historyText)
    }));

    allTags.add('(Untagged)');
    state.allTags = Array.from(allTags).sort();

    if (tasks.length > 0) {
      minDate = dayjs(tasks.reduce((m, p) => p.created < m ? p.created : m, tasks[0].created)).startOf('day');
    }

    events.clear();
    const addEvent = (dateStr, type, task) => {
      if (!events.has(dateStr)) events.set(dateStr, { created: [], completed: [], stateChange: [] });
      events.get(dateStr)[type].push(task);
    };

    tasks.forEach(task => {
      addEvent(dayjs(task.created).format('YYYY-MM-DD'), 'created', task);
      if (task.completed) {
        addEvent(dayjs(task.completed).add(1, 'day').format('YYYY-MM-DD'), 'completed', task);
      }
      task.history.forEach(h => addEvent(h.date, 'stateChange', task));
      if (task.dueDate) {
        addEvent(dayjs(task.dueDate).format('YYYY-MM-DD'), 'stateChange', task);
      }
    });
  }

  function calculateRawData(limitDateStr) {
    const limitDate = dayjs(limitDateStr);
    const calculatedData = [];
    if (!minDate.isBefore(limitDate)) return [];

    let tempDate = minDate.clone();
    const runningCounts = { total: 0 };
    state.allTags.forEach(t => runningCounts[t] = 0);
    state.allDueDateStatuses.forEach(s => runningCounts[s] = 0);
    const activeTasks = new Map();

    while (tempDate.isBefore(limitDate.add(1, 'day'))) {
      const dateStr = tempDate.format('YYYY-MM-DD');
      if (events.has(dateStr)) {
        const dayEvents = events.get(dateStr);
        dayEvents.created.forEach(task => activeTasks.set(task.id, task));
        dayEvents.completed.forEach(task => activeTasks.delete(task.id));
      }

      Object.keys(runningCounts).forEach(k => runningCounts[k] = 0);
      activeTasks.forEach(task => {
        const { tags, dueDateCategory } = getTaskStateForDate(task, dateStr);

        const hasSelectedTag = tags.length > 0
          ? tags.some(t => state.selectedTags.has(t))
          : state.selectedTags.has('(Untagged)');
        const hasSelectedStatus = state.selectedDueDateStatuses.has(dueDateCategory);

        if (hasSelectedTag && hasSelectedStatus) {
          runningCounts.total++;
          const effectiveTags = tags.length > 0 ? tags : ['(Untagged)'];
          effectiveTags.forEach(tag => {
            if (runningCounts[tag] !== undefined) runningCounts[tag]++;
          });
          if (runningCounts[dueDateCategory] !== undefined) runningCounts[dueDateCategory]++;
        }
      });
      calculatedData.push({ date: dateStr, ...runningCounts });
      tempDate = tempDate.add(1, 'day');
    }
    return calculatedData;
  }

  function getDueDateCategory(dueDate, referenceDate) {
    if (!dueDate) return 'Undated';
    const due = dayjs(dueDate);
    const ref = dayjs(referenceDate);
    return due.isAfter(ref, 'day') ? 'Future' : 'Overdue';
  }

  function parseHistoryLedger(text) {
    if (!text) return [];
    const dailyState = new Map();
    const regex = /\[(.*?)\] --- Tags: \[(.*?)\](?:, Due Date: (.*?))?$/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const entryDate = dayjs(match[1].split(' ')[0]);
      const dateKey = entryDate.format('YYYY-MM-DD');
      dailyState.set(dateKey, {
        tags: match[2] ? match[2].split(', ').filter(t => t) : [],
        dueDate: match[3] && match[3] !== 'undefined' ? match[3] : null
      });
    }
    return Array.from(dailyState.entries())
      .map(([date, state]) => ({ date, ...state }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function getTaskStateForDate(task, dateStr) {
    const dueDateCategory = getDueDateCategory(task.dueDate, dateStr);
    if (task.history.length === 0) return { tags: task.tags, dueDateCategory };
    let activeTags = task.tags;
    for (const entry of task.history) {
      if (dayjs(entry.date).isAfter(dateStr, 'day')) break;
      activeTags = entry.tags;
    }
    return { tags: activeTags, dueDateCategory };
  }

  // --- UI and Charting Functions ---
  function renderChart() {
    updateFilterUI();
    updateActiveGroupByButton();
    updateDateInputs();

    const seriesData = processChartSeries();
    myChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: seriesData.map(s => s.name), top: 10, type: 'scroll' },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: [{ type: 'time', boundaryGap: false }],
      yAxis: [{ type: 'value', name: 'Total Active Tasks' }],
      dataZoom: [{ type: 'inside', startValue: state.dateRange.start, endValue: state.dateRange.end }, { type: 'slider', startValue: state.dateRange.start, endValue: state.dateRange.end, bottom: 10 }],
      series: seriesData
    }, { notMerge: true });
  }

  function processChartSeries() {
    const isGroupByTag = state.groupBy === 'tag';
    const categories = isGroupByTag ? [...state.selectedTags].sort() : [...state.selectedDueDateStatuses];

    return categories.map(category => ({
      name: category,
      type: 'line',
      stack: 'Total',
      areaStyle: {},
      emphasis: { focus: 'series' },
      smooth: true,
      data: rawData.map(d => [d.date, d[category] || 0])
    }));
  }

  function updateFilterUI() {
    tagListContainer.innerHTML = '';
    state.allTags.forEach(tag => {
      createCheckbox(tagListContainer, tag, state.selectedTags.has(tag), 'tag');
    });

    statusListContainer.innerHTML = '';
    state.allDueDateStatuses.forEach(status => {
      createCheckbox(statusListContainer, status, state.selectedDueDateStatuses.has(status), 'status');
    });

    updateTagDropdownLabel();
    updateStatusDropdownLabel();
  }

  function createCheckbox(container, item, isChecked, type) {
    const itemEl = document.createElement('div');
    itemEl.className = 'flex items-center p-2 hover:bg-gray-100 cursor-pointer';
    const checkboxId = `${type}-chk-${item.replace(/\s+/g, '-')}`;
    itemEl.innerHTML = `
      <input id="${checkboxId}" type="checkbox" ${isChecked ? 'checked' : ''} data-category="${item}" data-type="${type}" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
      <label for="${checkboxId}" class="ml-3 block text-sm text-gray-900 flex-1 cursor-pointer">${item}</label>`;
    container.appendChild(itemEl);
  }

  function updateTagDropdownLabel() {
    const count = state.selectedTags.size;
    const total = state.allTags.length;
    if (count === 0) tagDropdownLabel.textContent = 'Select Tag(s)';
    else if (count === total) tagDropdownLabel.textContent = 'All Tags';
    else tagDropdownLabel.textContent = `${count} Tag(s) Selected`;
  }

  function updateStatusDropdownLabel() {
    const count = state.selectedDueDateStatuses.size;
    const total = state.allDueDateStatuses.length;
    if (count === 0) statusDropdownLabel.textContent = 'Select Status(es)';
    else if (count === total) statusDropdownLabel.textContent = 'All Statuses';
    else statusDropdownLabel.textContent = `${count} Status(es) Selected`;
  }

  function updateActiveGroupByButton() {
    document.querySelectorAll('.group-by-btn').forEach(btn => {
      const isSelected = btn.dataset.group === state.groupBy;
      btn.classList.toggle('bg-blue-500', isSelected);
      btn.classList.toggle('text-white', isSelected);
      btn.classList.toggle('bg-gray-200', !isSelected);
      btn.classList.toggle('text-gray-700', !isSelected);
    });
  }

  function updateDateInputs() {
    startDateInput.value = state.dateRange.start;
    endDateInput.value = state.dateRange.end;
  }

  function shiftDateRange(amount, unit) {
    const newStart = dayjs(state.dateRange.start).add(amount, unit);
    const duration = dayjs(state.dateRange.end).diff(dayjs(state.dateRange.start), 'day');
    state.dateRange.start = newStart.format('YYYY-MM-DD');
    state.dateRange.end = newStart.add(duration, 'day').format('YYYY-MM-DD');
    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  }

  function processAndRender(pages) {
    if (!pages || pages.length === 0) return;
    loaderContainer.classList.add('hidden');
    allFetchedPages = pages;

    prepareTasksAndEvents(allFetchedPages);

    state.allTags.forEach(tag => state.selectedTags.add(tag));
    state.allDueDateStatuses.forEach(status => state.selectedDueDateStatuses.add(status));

    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  }

  function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
  }

  const debouncedRecalculateAndRender = debounce(() => {
    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  }, 250);

  // --- Event Listeners ---
  groupBySwitcher.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.group) {
      state.groupBy = e.target.dataset.group;
      renderChart();
    }
  });

  function handleFilterChange(e) {
    if (e.target.type === 'checkbox' && e.target.dataset.category) {
      const category = e.target.dataset.category;
      const type = e.target.dataset.type;
      const targetSet = type === 'tag' ? state.selectedTags : state.selectedDueDateStatuses;

      if (e.target.checked) targetSet.add(category);
      else targetSet.delete(category);

      rawData = calculateRawData(getCalculationLimitDate());
      renderChart();
    }
  }
  tagFilterContainer.addEventListener('change', handleFilterChange);
  statusFilterContainer.addEventListener('change', handleFilterChange);

  includeIncompleteToggle.addEventListener('change', () => {
    state.includeIncomplete = includeIncompleteToggle.checked;
    prepareTasksAndEvents(allFetchedPages);
    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  });

  includeLegacyToggle.addEventListener('change', () => {
    state.includeLegacyTasks = includeLegacyToggle.checked;
    prepareTasksAndEvents(allFetchedPages);
    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  });

  tagDropdownButton.addEventListener('click', () => tagDropdownPanel.classList.toggle('hidden'));
  statusDropdownButton.addEventListener('click', () => statusDropdownPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!tagFilterContainer.contains(e.target)) {
      tagDropdownPanel.classList.add('hidden');
    }
    if (!statusFilterContainer.contains(e.target)) {
      statusDropdownPanel.classList.add('hidden');
    }
  });

  const updateDateRangeAndRender = () => {
    state.dateRange.start = startDateInput.value;
    state.dateRange.end = endDateInput.value;
    rawData = calculateRawData(getCalculationLimitDate());
    renderChart();
  };
  startDateInput.addEventListener('change', updateDateRangeAndRender);
  endDateInput.addEventListener('change', updateDateRangeAndRender);

  if (prevMonthButton) prevMonthButton.addEventListener('click', () => shiftDateRange(-1, 'month'));
  if (nextMonthButton) nextMonthButton.addEventListener('click', () => shiftDateRange(1, 'month'));

  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') shiftDateRange(e.shiftKey ? -1 : -7, e.shiftKey ? 'month' : 'day');
    else if (e.key === 'ArrowRight') shiftDateRange(e.shiftKey ? 1 : 7, e.shiftKey ? 'month' : 'day');
  });

  myChart.on('datazoom', function () {
    const model = myChart.getModel();
    const axis = model.getComponent('xAxis', 0).axis;
    const [start, end] = axis.scale.getExtent();
    const newStart = dayjs(start).format('YYYY-MM-DD');
    const newEnd = dayjs(end).format('YYYY-MM-DD');
    if (newStart !== state.dateRange.start || newEnd !== state.dateRange.end) {
      state.dateRange.start = newStart;
      state.dateRange.end = newEnd;
      updateDateInputs();
      debouncedRecalculateAndRender();
    }
  });

  window.addEventListener('resize', () => myChart.resize());

  // --- Initial Data Fetch ---
  fetch('http://127.0.0.1:5000/api/cached-data').then(res => res.json()).then(cachedPages => {
    if (cachedPages && cachedPages.length > 0) processAndRender(cachedPages);
  }).catch(err => console.error('Error fetching cached data:', err));

  fetch('http://127.0.0.1:5000/api/refresh-data').then(res => res.json()).then(freshPages => {
    if (freshPages && freshPages.length > 0) processAndRender(freshPages);
  }).catch(err => console.error('Error fetching fresh data:', err));
});
document.addEventListener('DOMContentLoaded', async function () {
  console.log('DOMContentLoaded fired - initializing stacked task chart script');
  // --- DOM ELEMENT REFERENCES ---
  const chartContainer = document.getElementById('chart-container');
  const loaderContainer = document.getElementById('loader-container');
  const categoryTypeSwitcher = document.getElementById('category-type-switcher');
  const categoryFilterContainer = document.getElementById('category-filter');
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');

  console.debug('DOM elements resolved:', {
    chartContainerExists: !!chartContainer,
    loaderContainerExists: !!loaderContainer,
    categoryTypeSwitcherExists: !!categoryTypeSwitcher,
    categoryFilterContainerExists: !!categoryFilterContainer,
    startDateInputExists: !!startDateInput,
    endDateInputExists: !!endDateInput
  });

  const myChart = echarts.init(chartContainer);
  let rawData = [];

  // --- STATE MANAGEMENT ---
  let state = {
    categoryType: 'tag', // 'tag' or 'dueDate'
    dateRange: {
      start: dayjs().subtract(3, 'month').format('YYYY-MM-DD'),
      end: dayjs().format('YYYY-MM-DD')
    },
    selectedCategories: new Set(),
    allTags: [],
    allDueDateStatuses: ['Dated', 'Overdue', 'Undated']
  };

  console.debug('Initial state created:', {
    categoryType: state.categoryType,
    dateRange: state.dateRange,
    allDueDateStatuses: state.allDueDateStatuses
  });

  async function fetchNotionData() {
    let allPages = [];
    let hasMore = true;
    let startCursor = undefined;

    try {
      console.log(`🚀 Starting to fetch all pages from backend server:`);
      let pageCount = 1;
      const fetchStartTime = Date.now();

      // The 'hasMore' and 'startCursor' variables are assumed to be declared
      // in an outer scope with initial values (e.g., true and undefined).
      while (hasMore) {
        console.group(`➡️ Fetching Page #${pageCount} via local proxy`);
        console.debug(`Cursor for this request: ${startCursor || 'Initial Request'}`);

        // The URL of your local Python server
        const requestUrl = 'http://127.0.0.1:5000/api/query';
        const requestBody = {
          start_cursor: startCursor
        };

        console.info(`Requesting: POST ${requestUrl}`);
        console.debug('Request body:', requestBody);

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        console.info(`⬅️ Received Response Status from proxy: ${response.status} ${response.statusText}`);

        // Try to capture a small snippet of the response for debugging (non-destructive)
        try {
          const textPreview = await response.clone().text();
          console.debug('Response text preview (first 500 chars):', textPreview.slice(0, 500));
        } catch (previewErr) {
          console.debug('Could not read response clone for preview:', previewErr);
        }

        if (!response.ok) {
          console.error('❌ Request failed. Response status was not OK.');
          let errorData;
          try {
            errorData = await response.json();
            console.error("Detailed error response from proxy/Notion:", errorData);
          } catch (jsonErr) {
            console.error('Failed to parse error JSON from response:', jsonErr);
            throw new Error(`API responded with status: ${response.status}`);
          }
          throw new Error(errorData.message || `API responded with status: ${response.status}`);
        }

        console.log('✅ Request successful. Parsing JSON response...');
        const pageData = await response.json();

        // The rest of the logic remains the same
        allPages.push(...pageData.results);
        hasMore = pageData.has_more;
        startCursor = pageData.next_cursor;

        console.log(`📄 Found ${pageData.results.length} pages in this batch.`);
        console.log(`📈 Total pages collected so far: ${allPages.length}`);
        console.debug(`Pagination - 'has_more' is now: ${hasMore}`);

        if (hasMore) {
          console.debug(`Pagination - 'next_cursor' is now: ${startCursor}`);
        } else {
          console.log('🏁 This was the last page of data.');
        }

        console.groupEnd();
        pageCount++;
      }

      const fetchDurationMs = Date.now() - fetchStartTime;
      console.log(`🎉 Successfully fetched all pages. Final count: ${allPages.length} (took ${fetchDurationMs}ms)`);
      return allPages;

    } catch (error) {
      // Ungroup in case the error happened inside a log group
      try { console.groupEnd(); } catch (_) { }
      console.error("🚨 An error occurred during the Notion fetch operation:", error.message || error);
      console.error("Full error object for debugging:", error);

      console.warn('Operation aborted due to error. Returning null.');
      return null;
    }
  }

  // --- DATA PROCESSING ---
  function getDueDateCategory(dueDate, referenceDate) {
    console.debug('getDueDateCategory called with:', { dueDate, referenceDate });
    if (!dueDate) {
      console.debug('No dueDate provided -> Undated');
      return 'Undated';
    }
    const due = dayjs(dueDate);
    const ref = dayjs(referenceDate);
    // An item is Overdue if its due date is today or in the past
    const result = due.isAfter(ref, 'day') ? 'Dated' : 'Overdue';
    console.debug('getDueDateCategory result:', result, { due: due.format(), ref: ref.format() });
    return result;
  }

  function parseHistoryLedger(text) {
    console.debug('parseHistoryLedger called. text length:', text ? text.length : 0);
    if (!text) return [];
    const dailyState = new Map();
    const regex = /\[(.*?)\] --- Tags: \[(.*?)\](?:, Due Date: (.*?))?$/gm;
    let match;
    let matchesFound = 0;
    while ((match = regex.exec(text)) !== null) {
      matchesFound++;
      const entryDate = dayjs(match[1].split(' ')[0]); // Ignore time
      const dateKey = entryDate.format('YYYY-MM-DD');
      // Overwrite with the latest entry for that day
      dailyState.set(dateKey, {
        tags: match[2] ? match[2].split(', ').filter(t => t) : [],
        dueDate: match[3] && match[3] !== 'undefined' ? match[3] : null
      });
      if (matchesFound <= 3) {
        console.debug('parseHistoryLedger sample match:', { dateKey, parsed: dailyState.get(dateKey) });
      }
    }
    console.debug('parseHistoryLedger total matches found:', matchesFound);
    // Convert map to sorted array
    const result = Array.from(dailyState.entries())
      .map(([date, state]) => ({ date, ...state }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    console.debug('parseHistoryLedger returning entries count:', result.length);
    return result;
  }

  function getTaskStateForDate(task, dateStr) {
    console.debug('getTaskStateForDate', { dateStr, taskSummary: { created: task.created, completed: task.completed, tagsLength: (task.tags || []).length, historyLength: (task.history || []).length } });
    // If there's no history, use the final state of the task
    if (task.history.length === 0) {
      const res = {
        tags: task.tags,
        dueDateCategory: getDueDateCategory(task.dueDate, dateStr)
      };
      console.debug('No history -> using final state:', res);
      return res;
    }

    // Find the most recent history entry on or before the given date
    let activeState = null;
    for (const entry of task.history) {
      if (dayjs(entry.date).isAfter(dateStr, 'day')) break;
      activeState = entry;
    }

    // If no history entry is found before the date, it means the task was in its original state
    if (!activeState) {
      console.debug('No active history entry before date -> fallback to final state', { fallbackDue: task.dueDate });
      return {
        tags: task.tags,
        dueDateCategory: getDueDateCategory(task.dueDate, dateStr)
      };
    }

    const result = {
      tags: activeState.tags,
      dueDateCategory: getDueDateCategory(activeState.dueDate, dateStr)
    };
    console.debug('Active history state used for date:', dateStr, result);
    return result;
  }

  function processNotionPages(pages) {
    console.log('processNotionPages called with pagesCount:', pages.length);
    const allTags = new Set();
    const tasks = pages.map(page => {
      const props = page.properties;
      const getProp = (name, type, sub) => (props[name] && props[name][type]) ? props[name][type][sub] : null;
      const getMultiSelect = (name) => (props[name]?.multi_select || []).map(t => t.name);
      const getRichText = (name) => (props[name]?.rich_text[0]?.plain_text || '');

      const tags = getMultiSelect('Tags') || getMultiSelect('Tag');
      tags.forEach(tag => allTags.add(tag));

      return {
        created: getProp('Date Created', 'created_time'), // This is actually a datetime, but we'll ignore time
        completed: getProp('Completed Date', 'date', 'start'),
        dueDate: getProp('Due Date', 'date', 'start'),
        status: getProp('Status', 'status', 'name'),
        tags: tags,
        historyText: getRichText('Tag & Date History'),
        isUseless: tags.includes('useless'),
      };
    }).filter(task =>
      task.created && task.status !== 'Cancelled' && !task.isUseless
    ).map(task => ({
      ...task,
      history: parseHistoryLedger(task.historyText)
    }));

    console.debug('Tasks after mapping/filtering:', { totalTasks: tasks.length, uniqueTags: allTags.size });

    state.allTags = Array.from(allTags).sort();
    console.debug('state.allTags updated:', state.allTags.slice(0, 20));

    if (tasks.length === 0) {
      console.warn('No tasks to process - returning empty dataset');
      return [];
    }

    const todayStr = dayjs().format('YYYY-MM-DD');
    let minDate = dayjs(tasks.reduce((min, p) => p.created < min ? p.created : min, tasks[0].created)).startOf('day');
    console.debug('Computed minDate for timeline:', minDate.format('YYYY-MM-DD'), 'today:', todayStr);

    const dailyCounts = new Map();
    let tempDate = minDate.clone();
    while (tempDate.isBefore(dayjs().add(1, 'day'))) {
      const dateStr = tempDate.format('YYYY-MM-DD');
      const counts = { date: dateStr, total: 0 };
      state.allTags.forEach(t => counts[t] = 0);
      state.allDueDateStatuses.forEach(s => counts[s] = 0);
      dailyCounts.set(dateStr, counts);
      tempDate = tempDate.add(1, 'day');
    }

    console.debug('Initialized dailyCounts length:', dailyCounts.size);

    tasks.forEach((task, idx) => {
      let currentDate = dayjs(task.created).startOf('day');
      const endDate = dayjs(task.completed || todayStr).startOf('day');

      // A task is active from its created date up to and including its completed date
      while (!currentDate.isAfter(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        const dayData = dailyCounts.get(dateStr);
        if (dayData) {
          const { tags, dueDateCategory } = getTaskStateForDate(task, dateStr);
          dayData.total++;
          tags.forEach(tag => { if (dayData[tag] !== undefined) dayData[tag]++; });
          if (dayData[dueDateCategory] !== undefined) dayData[dueDateCategory]++;
        }
        currentDate = currentDate.add(1, 'day');
      }

      if (idx % 100 === 0) {
        console.debug(`Processed ${idx + 1}/${tasks.length} tasks`, { sampleTask: { created: task.created, completed: task.completed } });
      }
    });

    console.log('Completed processing tasks into dailyCounts. Returning array.');
    return Array.from(dailyCounts.values());
  }

  function processChartData() {
    console.debug('processChartData called. Current state snapshot:', {
      categoryType: state.categoryType,
      selectedCategoriesCount: state.selectedCategories.size,
      allTagsCount: state.allTags.length
    });
    const categories = state.categoryType === 'tag' ? state.allTags : state.allDueDateStatuses;
    if (state.selectedCategories.size === 0) {
      categories.forEach(cat => state.selectedCategories.add(cat));
      console.debug('No selectedCategories - defaulting to all categories:', categories.length);
    }

    const series = categories
      .filter(cat => state.selectedCategories.has(cat))
      .map(category => ({
        name: category,
        type: 'line',
        stack: 'Total',
        areaStyle: {},
        emphasis: { focus: 'series' },
        smooth: true,
        data: rawData.map(d => [d.date, d[category] || 0])
      }));

    console.debug('processChartData returning series count:', series.length);
    return { series };
  }

  // --- UI RENDERING & EVENT LISTENERS ---
  function updateCategoryFilterUI() {
    const categories = state.categoryType === 'tag' ? state.allTags : state.allDueDateStatuses;
    categoryFilterContainer.innerHTML = '';
    console.debug('updateCategoryFilterUI rendering categories count:', categories.length);
    categories.forEach(cat => {
      const isChecked = state.selectedCategories.has(cat);
      const div = document.createElement('div');
      div.className = 'flex items-center';
      div.innerHTML = `
                        <input id="cat-${cat}" type="checkbox" ${isChecked ? 'checked' : ''} data-category="${cat}" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                        <label for="cat-${cat}" class="ml-2 block text-sm text-gray-900 truncate" title="${cat}">${cat}</label>
                    `;
      categoryFilterContainer.appendChild(div);
    });
  }

  function updateActiveCategoryButton() {
    console.debug('updateActiveCategoryButton - active type:', state.categoryType);
    document.querySelectorAll('.category-btn').forEach(btn => {
      const isSelected = btn.dataset.type === state.categoryType;
      btn.classList.toggle('bg-blue-500', isSelected);
      btn.classList.toggle('text-white', isSelected);
      btn.classList.toggle('bg-gray-200', !isSelected);
      btn.classList.toggle('text-gray-700', !isSelected);
    });
  }

  function updateDateInputs() {
    console.debug('updateDateInputs setting start/end:', state.dateRange);
    startDateInput.value = state.dateRange.start;
    endDateInput.value = state.dateRange.end;
  }

  function renderChart() {
    console.log('renderChart called');
    if (rawData.length === 0) {
      console.warn('renderChart aborted: rawData is empty');
      return;
    }
    const { series } = processChartData();

    console.debug('renderChart preparing to update UI and chart with series count:', series.length);
    updateCategoryFilterUI();
    updateActiveCategoryButton();
    updateDateInputs();

    myChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: series.map(s => s.name), top: 10, type: 'scroll' },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: [{ type: 'time', boundaryGap: false }],
      yAxis: [{ type: 'value', name: 'Total Active Tasks' }],
      dataZoom: [
        { type: 'inside', startValue: state.dateRange.start, endValue: state.dateRange.end },
        { type: 'slider', startValue: state.dateRange.start, endValue: state.dateRange.end, bottom: 10 }
      ],
      series: series
    }, { notMerge: true });

    console.log('Chart updated with new option. seriesCount:', series.length);
  }

  // --- EVENT HANDLER SETUP ---
  categoryTypeSwitcher.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      console.debug('categoryTypeSwitcher clicked - target dataset:', e.target.dataset);
      state.categoryType = e.target.dataset.type;
      state.selectedCategories.clear();
      console.info('Category type changed to:', state.categoryType);
      renderChart();
    }
  });

  categoryFilterContainer.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const category = e.target.dataset.category;
      console.debug('Category filter toggled:', { category, checked: e.target.checked });
      if (e.target.checked) state.selectedCategories.add(category);
      else state.selectedCategories.delete(category);
      renderChart();
    }
  });

  const updateDateRangeAndRender = () => {
    console.debug('Date inputs changed - previous dateRange:', state.dateRange);
    state.dateRange.start = startDateInput.value;
    state.dateRange.end = endDateInput.value;
    console.info('Date range updated to:', state.dateRange);
    renderChart();
  };
  startDateInput.addEventListener('change', updateDateRangeAndRender);
  endDateInput.addEventListener('change', updateDateRangeAndRender);

  function shiftDateRange(amount, unit) {
    console.debug('shiftDateRange called', { amount, unit, prev: state.dateRange });
    const newStart = dayjs(state.dateRange.start).add(amount, unit);
    const duration = dayjs(state.dateRange.end).diff(dayjs(state.dateRange.start), 'day');
    state.dateRange.start = newStart.format('YYYY-MM-DD');
    state.dateRange.end = newStart.add(duration, 'day').format('YYYY-MM-DD');
    console.info('Date range shifted to:', state.dateRange);
    renderChart();
  }

  document.getElementById('prev-month').addEventListener('click', () => {
    console.debug('prev-month clicked');
    shiftDateRange(-1, 'month');
  });
  document.getElementById('next-month').addEventListener('click', () => {
    console.debug('next-month clicked');
    shiftDateRange(1, 'month');
  });

  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    console.debug('keydown captured:', { key: e.key, shiftKey: e.shiftKey });
    if (e.key === 'ArrowLeft') shiftDateRange(e.shiftKey ? -1 : -7, e.shiftKey ? 'month' : 'day');
    else if (e.key === 'ArrowRight') shiftDateRange(e.shiftKey ? 1 : 7, e.shiftKey ? 'month' : 'day');
  });

  myChart.on('datazoom', function () {
    console.debug('myChart datazoom event triggered');
    const model = myChart.getModel();
    const axis = model.getComponent('xAxis', 0).axis;
    const [start, end] = axis.scale.getExtent();
    const newStart = dayjs(start).format('YYYY-MM-DD');
    const newEnd = dayjs(end).format('YYYY-MM-DD');

    console.debug('datazoom computed extents:', { newStart, newEnd, prev: state.dateRange });

    if (newStart !== state.dateRange.start || newEnd !== state.dateRange.end) {
      state.dateRange.start = newStart;
      state.dateRange.end = newEnd;
      updateDateInputs();
      console.info('Date range updated from datazoom:', state.dateRange);
    }
  });

  window.addEventListener('resize', () => {
    console.debug('Window resize event - resizing chart');
    myChart.resize();
  });

  // --- INITIALIZATION ---
  const notionPages = await fetchNotionData();
  if (notionPages) {
    loaderContainer.classList.add('hidden');
    rawData = processNotionPages(notionPages);
    console.info('Initialization complete - rawData length:', rawData.length);
    renderChart();
  } else {
    console.warn('Initialization aborted - notionPages is null');
  }
});

console.log("Script file is running!");
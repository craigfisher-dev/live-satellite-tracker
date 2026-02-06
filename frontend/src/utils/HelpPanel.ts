import * as Cesium from 'cesium'

export function setupHelpPanel(viewer: Cesium.Viewer) {
  if (!viewer.navigationHelpButton) return

  // Show instructions by default on startup
  viewer.navigationHelpButton.viewModel.showInstructions = true
  
  // Wait for the DOM to be ready
  setTimeout(() => {
    const clickHelp = document.querySelector('.cesium-click-navigation-help')
    
    // Apply custom font sizes to original Cesium content
    if (clickHelp) {
      const titleElements = clickHelp.querySelectorAll(
        '.cesium-navigation-help-pan, .cesium-navigation-help-zoom, .cesium-navigation-help-rotate, .cesium-navigation-help-tilt'
      )
      const detailElements = clickHelp.querySelectorAll('.cesium-navigation-help-details')
      
      titleElements.forEach(el => {
        (el as HTMLElement).style.fontSize = '12px'
      })
      
      detailElements.forEach(el => {
        (el as HTMLElement).style.fontSize = '11px'
      })
    }
    
    // Check if we already added the custom sections
    if (clickHelp && !clickHelp.querySelector('.custom-help-content')) {
      const cameraTitle = document.createElement('div')
      cameraTitle.style.cssText = 'font-weight: bold; margin-bottom: 4px; font-size: 16px; text-align: center; color: white; padding-top: 6px;'
      cameraTitle.textContent = 'Camera Controls'
      clickHelp.insertBefore(cameraTitle, clickHelp.firstChild)

      // Add home button row to existing Cesium camera table
      const cameraTable = clickHelp.querySelector('table tbody')
      if (cameraTable) {
        const homeRow = document.createElement('tr')
        homeRow.innerHTML = `
          <td style="text-align: center; vertical-align: middle;"><img src="/cesium/Widgets/Images/NavigationHelp/MouseLeft.svg" width="48" height="48"></td>
          <td>
            <div class="cesium-navigation-help-pan" style="font-size: 12px;">Reset camera</div>
            <div class="cesium-navigation-help-details" style="font-size: 11px;">Click home button (top-right)</div>
          </td>
        `
        cameraTable.appendChild(homeRow)
      }
      
      addCustomContent(clickHelp)
    }

    // Rename the home button tooltip
    const homeButton = document.querySelector('.cesium-home-button') as HTMLElement
    if (homeButton) {
      homeButton.setAttribute('title', 'Reset Camera View')
    }

    // Make the help panel scrollable with hidden scrollbar
    const helpPanel = document.querySelector('.cesium-navigation-help') as HTMLElement
    if (helpPanel) {
      helpPanel.style.maxHeight = 'calc(100vh - 100px)'
      helpPanel.style.overflowY = 'auto'
      helpPanel.style.scrollbarWidth = 'none'
      ;(helpPanel.style as any).msOverflowStyle = 'none'
      
      const style = document.createElement('style')
      style.textContent = `
        .cesium-navigation-help::-webkit-scrollbar {
          display: none;
        }
        /* Hide touch tab — desktop only for now.
           TODO: Add mobile/touch support in the future with responsive
           layout and touch-friendly custom sections. */
        .cesium-navigation-button-right {
          display: none !important;
        }
        .cesium-navigation-button-left {
          border-right: none !important;
          width: 100% !important;
          padding: 8px 12px !important;
        }
      `
      document.head.appendChild(style)
      
      helpPanel.addEventListener('click', (e) => {
        e.stopPropagation()
      })
    }

    setupToggleButton(viewer)
  }, 100)
}

function addCustomContent(container: Element) {
  const customContent = document.createElement('div')
  customContent.className = 'custom-help-content'
  customContent.style.cssText = 'padding-top: 6px; padding-bottom: 6px;'
  
  const isWideScreen = window.innerWidth >= 768

  // Lucide icon SVG paths
  const icons = {
    fastForwardReverse: '<polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon>',
    play: '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    fastForward: '<polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon>',
    rotateCcw: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"></polyline>',
    chevronRight: '<polyline points="9 18 15 12 9 6"></polyline>',
  }

  const createIconRow = (iconSvg: string, title: string, description: string) => {
    const row = document.createElement('div')
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;'
    
    const iconContainer = document.createElement('div')
    iconContainer.style.cssText = 'min-width: 24px; display: flex; align-items: center; justify-content: center;'
    iconContainer.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>`
    
    const textContainer = document.createElement('div')
    textContainer.innerHTML = `
      <div style="color: rgba(255, 255, 255, 0.9); font-size: 12px;">${title}</div>
      <div style="color: rgba(255, 255, 255, 0.5); font-size: 11px;">${description}</div>
    `
    
    row.appendChild(iconContainer)
    row.appendChild(textContainer)
    return row
  }

  // Satellite Orbits Section
  const satelliteSection = document.createElement('div')
  satelliteSection.style.cssText = 'border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 6px; padding-top: 6px;'
  satelliteSection.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px; text-align: center; color: white;">Satellite Orbit Selection</div>
    <table>
      <tbody>
        <tr>
          <td style="text-align: center; vertical-align: middle;"><img src="/cesium/Widgets/Images/NavigationHelp/MouseLeft.svg" width="48" height="48"></td>
          <td>
            <div class="cesium-navigation-help-pan" style="font-size: 12px;">View orbit</div>
            <div class="cesium-navigation-help-details" style="font-size: 11px;">Left click satellite</div>
          </td>
        </tr>
        <tr>
          <td style="text-align: center; vertical-align: middle;"><img src="/cesium/Widgets/Images/NavigationHelp/MouseLeft.svg" width="48" height="48"></td>
          <td>
            <div class="cesium-navigation-help-pan" style="font-size: 12px;">Clear selection</div>
            <div class="cesium-navigation-help-details" style="font-size: 11px;">Left click empty space</div>
          </td>
        </tr>
      </tbody>
    </table>
  `

  // Time Controls Section
  const timeSection = document.createElement('div')
  timeSection.style.cssText = 'border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 6px; padding-top: 6px;'
  
  const timeTitle = document.createElement('div')
  timeTitle.style.cssText = 'font-weight: bold; margin-bottom: 4px; font-size: 14px; text-align: center; color: white;'
  timeTitle.textContent = isWideScreen ? 'Time Controls (Bottom-Right)' : 'Time Controls'
  
  const timeControls = document.createElement('div')
  timeControls.appendChild(createIconRow(icons.fastForwardReverse, 'Slow down', 'Decrease simulation speed'))
  timeControls.appendChild(createIconRow(icons.play, 'Play / Pause', 'Toggle simulation'))
  timeControls.appendChild(createIconRow(icons.fastForward, 'Speed up', 'Increase simulation speed'))
  timeControls.appendChild(createIconRow(icons.rotateCcw, 'Reset', 'Return to current time (1x speed)'))
  
  const speedRow = document.createElement('div')
  speedRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;'
  speedRow.innerHTML = `
    <div style="min-width: 24px; text-align: center; font-weight: bold; color: rgba(255, 255, 255, 0.7); font-size: 12px;">1x</div>
    <div>
      <div style="color: rgba(255, 255, 255, 0.9); font-size: 12px;">Speed indicator</div>
      <div style="color: rgba(255, 255, 255, 0.5); font-size: 11px;">Current simulation speed</div>
    </div>
  `
  timeControls.appendChild(speedRow)
  
  timeSection.appendChild(timeTitle)
  timeSection.appendChild(timeControls)

  // Filter Controls Section
  const filterSection = document.createElement('div')
  filterSection.style.cssText = 'border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 6px; padding-top: 6px;'
  
  const filterTitle = document.createElement('div')
  filterTitle.style.cssText = 'font-weight: bold; margin-bottom: 4px; font-size: 14px; text-align: center; color: white;'
  filterTitle.textContent = isWideScreen ? 'Filter Controls (Top-Left)' : 'Filter Controls'
  
  const filterControls = document.createElement('div')
  filterControls.appendChild(createIconRow(icons.chevronLeft, 'Previous filter', 'Altitude ← Network'))
  filterControls.appendChild(createIconRow(icons.chevronRight, 'Next filter', 'Network → Altitude'))
  
  filterSection.appendChild(filterTitle)
  filterSection.appendChild(filterControls)

  // Help Panel Control
  const helpControl = document.createElement('div')
  helpControl.style.cssText = 'border-top: 1px solid rgba(255, 255, 255, 0.2); margin-top: 6px; padding-top: 6px;'
  helpControl.innerHTML = `
    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); text-align: center;">
      Click the <strong>?</strong> button to close/reopen this panel
    </div>
  `

  customContent.appendChild(satelliteSection)
  customContent.appendChild(timeSection)
  customContent.appendChild(filterSection)
  customContent.appendChild(helpControl)
  
  container.appendChild(customContent)
}

function setupToggleButton(viewer: Cesium.Viewer) {
  const viewModel = viewer.navigationHelpButton?.viewModel
  if (!viewModel) return

  // Rename the tab
  const mouseTab = document.querySelector('.cesium-navigation-button-left') as HTMLElement
  if (mouseTab) {
    mouseTab.textContent = 'Navigation & Controls'
  }

  // Rename the ? button tooltip
  viewModel.tooltip = 'Navigation & Controls'

  setTimeout(() => {
    const helpButton = document.querySelector('.cesium-navigation-help-button')
    if (helpButton) {
      const newHelpButton = helpButton.cloneNode(true) as HTMLElement
      newHelpButton.setAttribute('title', 'Navigation & Controls')
      helpButton.parentNode?.replaceChild(newHelpButton, helpButton)
      
      newHelpButton.addEventListener('click', (e) => {
        e.stopPropagation()
        viewModel.showInstructions = !viewModel.showInstructions
      })
    }
  }, 200)
}
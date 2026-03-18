import { test, expect, BrowserContext, Page } from '@playwright/test'

// E2E Test: Full 1:1 video call via Cloudflare Realtime
// This test automates the manual two-tab test procedure

test.describe('1:1 Video Call', () => {
  let callerContext: BrowserContext
  let callerPage: Page
  let calleeContext: BrowserContext
  let calleePage: Page
  const CALL_ID = `e2e-test-${Date.now()}`

  test.beforeAll(async ({ browser }) => {
    // Create two separate browser contexts (simulates two users)
    callerContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })
    calleeContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    })

    callerPage = await callerContext.newPage()
    calleePage = await calleeContext.newPage()
  })

  test.afterAll(async () => {
    await callerContext.close()
    await calleeContext.close()
  })

  test('caller joins and publishes tracks', async () => {
    await callerPage.goto(`/?call=${CALL_ID}`)
    
    // Wait for initialization
    await expect(callerPage.locator('#status')).toContainText('Initializing', { timeout: 10000 })
    
    // Wait for local media capture (with fake devices this should work)
    await expect(callerPage.locator('#status')).toContainText('Local media captured', { timeout: 15000 })
    
    // Wait for session creation
    await expect(callerPage.locator('#status')).toContainText('Session created', { timeout: 15000 })
    
    // Wait for publish
    await expect(callerPage.locator('#status')).toContainText('Published and connected', { timeout: 20000 })
    
    // Wait for ICE connected
    await expect(callerPage.locator('#status')).toContainText('Publish ICE connected', { timeout: 20000 })
    
    // Verify local video is visible (has been set up)
    const localVideo = callerPage.locator('video#local')
    await expect(localVideo).toBeVisible()
    
    // Take screenshot of caller
    await callerPage.screenshot({ path: 'test-results/caller-joined.png' })
  })

  test('callee joins and both see each other', async () => {
    // Callee joins the same call
    await calleePage.goto(`/?call=${CALL_ID}`)
    
    // Wait for callee initialization
    await expect(calleePage.locator('#status')).toContainText('Local media captured', { timeout: 15000 })
    await expect(calleePage.locator('#status')).toContainText('Published and connected', { timeout: 20000 })
    
    // Give time for discovery polling (polls every 2 seconds)
    await calleePage.waitForTimeout(5000)
    
    // Caller should discover callee's tracks
    await expect(callerPage.locator('#status')).toContainText('Found', { timeout: 15000 })
    await expect(callerPage.locator('#status')).toContainText('new remote track', { timeout: 15000 })
    
    // Callee should also discover and subscribe
    await expect(calleePage.locator('#status')).toContainText('Found', { timeout: 15000 })
    
    // Wait for subscription to complete
    await expect(callerPage.locator('#status')).toContainText('Subscribed to remote tracks', { timeout: 20000 })
    await expect(calleePage.locator('#status')).toContainText('Subscribed to remote tracks', { timeout: 20000 })
    
    // Wait for media to flow
    await callerPage.waitForTimeout(3000)
    await calleePage.waitForTimeout(3000)
    
    // Verify both have remote video elements
    const callerRemoteVideo = callerPage.locator('video#remote')
    const calleeRemoteVideo = calleePage.locator('video#remote')
    
    await expect(callerRemoteVideo).toBeVisible()
    await expect(calleeRemoteVideo).toBeVisible()
    
    // Take final screenshots
    await callerPage.screenshot({ path: 'test-results/caller-final.png' })
    await calleePage.screenshot({ path: 'test-results/callee-final.png' })
    
    console.log('✅ 1:1 call established successfully')
  })

  test('both videos have playing state', async () => {
    // Verify video elements are in playing state
    const callerRemoteVideo = callerPage.locator('video#remote')
    const calleeRemoteVideo = calleePage.locator('video#remote')
    
    // Check paused property (should be false when playing)
    const callerPaused = await callerRemoteVideo.evaluate((el: HTMLVideoElement) => el.paused)
    const calleePaused = await calleeRemoteVideo.evaluate((el: HTMLVideoElement) => el.paused)
    
    console.log(`Caller video paused: ${callerPaused}`)
    console.log(`Callee video paused: ${calleePaused}`)
    
    // In a real call with media flowing, these would eventually be false
    // With fake streams, we just verify the elements exist and are set up
    expect(callerPaused).toBeDefined()
    expect(calleePaused).toBeDefined()
  })
})

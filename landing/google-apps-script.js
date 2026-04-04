// ============================================
// PASTE THIS CODE IN GOOGLE APPS SCRIPT
// (Extensions → Apps Script in your Google Sheet)
// ============================================

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // Add the email and timestamp to the sheet
    sheet.appendRow([
      data.email,
      new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
    ]);

    // Send email notification
    MailApp.sendEmail({
      to: 'infoomjisys@gmail.com',
      subject: 'New OMJI Beta Tester: ' + data.email,
      body: 'A new tester wants to join OMJI!\n\nEmail: ' + data.email + '\nDate: ' + new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
    });

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'OMJI Tester API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

---
name: ""
overview: ""
todos: []
isProject: false
---

# Plan: Add Patient Sticker Scanning to “New Patient Folder” in HALO

## Objective

Add a patient-sticker capture and extraction workflow to HALO so that when a user clicks **“New Patient Folder”**, they can either:

1. enter patient details manually, or
2. **scan / take a picture of a patient sticker** and let the system extract the patient details automatically.

The sticker workflow should reduce manual typing, improve speed in clinics, and lower admin errors during folder creation.

This feature should integrate with the existing HALO architecture and use the external functions API endpoint:

`POST /extract_patient_sticker`

The API expects a JSON body in this format:

```json
{
  "content": "base64_string",
  "contentType": "image"
}
```

and returns structured patient data, currently including:

```json
{
  "patient_name": "string",
  "patient_id": "string"
}
```

The API documentation confirms this endpoint is intended to extract patient details from a hospital sticker image or PDF.

---

## Product Goal

The “New Patient Folder” flow should support **two modes of patient creation**:

### Mode A: Manual Entry

The user manually fills in fields such as:

- patient full name
- ID / folder number
- date of birth
- gender

### Mode B: Sticker Scan / Photo Capture

The user clicks a button such as:

- **Scan Patient Sticker**
- **Take Photo of Sticker**
- **Upload Sticker Image**

The app then:

1. opens camera capture on supported devices or file picker as fallback
2. converts the selected image to base64
3. sends the image to the sticker extraction endpoint
4. receives structured patient data
5. pre-fills the New Patient Folder form automatically
6. lets the user review and confirm the extracted values before saving

This scan-based flow should be treated as the preferred fast-entry workflow in clinical environments.

---

## Core Functional Requirement

When the user presses **“New Patient Folder”**, the UI must present a clear choice:

- **Enter details manually**
- **Scan / Take picture of patient sticker**

If the user selects the scan route, the app must:

1. allow image capture directly from camera when possible
2. allow upload from device gallery/files as fallback
3. send the image to the extraction API
4. parse the returned data
5. populate the patient creation form automatically
6. allow the user to accept, adjust, or reject the extracted data
7. save the folder using the accepted values instead of requiring manual entry

The extracted data should be treated as **assistive data entry**, not forced data entry. The user must still be able to edit fields before final submission.

---

## Required Data Mapping

The extracted result must be mapped into HALO’s patient folder creation structure.

### At minimum, support these extracted fields:

- patient full name
- patient identifier
- date of birth
- gender

### Important note

The current API documentation explicitly shows `patient_name` and `patient_id` as the response for `/extract_patient_sticker`.

For this feature, the implementation must be designed so that it can also support:

- `dob`
- `gender`

If the current external service does not yet return those fields, the code should be built in a forward-compatible way so they can be consumed as soon as the API supports them.

That means the extraction handling should safely accept a response shape like:

```json
{
  "patient_name": "Jane Doe",
  "patient_id": "123456",
  "dob": "1992-04-16",
  "gender": "female"
}
```

without requiring major frontend refactoring later.

---

## Folder Naming Requirement

The feature must also populate the **folder title** automatically using the correct patient-folder naming convention.

The naming should use proper medical/patient-record nomenclature and should be consistent across HALO.

Example pattern:

```text
[Patient Full Name] - [DOB] - [Gender]
```

or whatever HALO’s existing canonical patient-folder naming format is.

If the project already has a naming standard, reuse it.
If not, create one and apply it consistently.

### Examples

- `Jane Doe - 1992-04-16 - Female`
- `John Smith - 1988-11-03 - Male`

If patient ID is part of HALO’s preferred record title structure, it can also be included, for example:

- `Jane Doe - 1992-04-16 - Female - 123456`

The key requirement is that **folder title creation should be automated from extracted data**, not left as a separate manual step.

---

## UX Requirements

### Entry point

Inside the **New Patient Folder** flow, the user must clearly see the two creation options.

### Suggested layout

- New Patient Folder modal or page opens
- section header: **Create New Patient Folder**
- option cards or buttons:
  - **Manual Entry**
  - **Scan Patient Sticker**

### If Scan Patient Sticker is chosen

Show:

- **Take Photo**
- **Upload Image**
- optional helper text:
  - “Use a clear photo of the patient sticker for best results.”

### After successful extraction

Show a review form with fields prefilled:

- Full Name
- Patient ID
- Date of Birth
- Gender
- Folder Title

The user can then:

- confirm
- edit any field
- proceed to create the folder

### If extraction fails

Show a user-friendly message such as:

- “We couldn’t read the sticker clearly. Please retake the photo or enter details manually.”

Also provide a quick fallback action:

- **Switch to Manual Entry**

---

## Camera / Capture Requirement

This feature must include an option to **scan or take a picture of the sticker directly after pressing “New Patient Folder.”**

This is not optional. It must be part of the folder-creation UX.

The implementation should support:

### Mobile-first behavior

On phones and tablets, the user should be able to:

- open the device camera
- take a photo of the sticker
- use that image immediately for extraction

### Desktop fallback

On desktop, the user should be able to:

- upload an existing image file

### Technical direction

Use a file input with image capture support where possible, for example:

- `accept="image/*"`
- `capture="environment"` where supported

This allows mobile devices to open the rear camera directly for sticker capture.

---

## Acceptance Instead of Manual Entry

A major functional requirement is that the scan workflow must support **accepting extracted details as the folder input**, instead of forcing the user to manually type the same details afterward.

That means:

- after extraction, the values should populate the actual patient folder form
- the user should be able to press **Create Folder** directly if the values look correct
- manual entry should remain available only as an override, not as a mandatory extra step

This is essential. The sticker scan must behave as a genuine time-saving intake workflow, not just a preview tool.

---

## Data Handling and Parsing Rules

### Full Name

Map the extracted patient name into HALO’s canonical patient-name field.

### Patient ID

Map the extracted sticker identifier into the patient ID / record number field.

### Date of Birth

If returned by the API, normalize into HALO’s preferred date format before display and storage.

### Gender

Normalize values to HALO’s accepted enum or terminology.

Examples:

- `male` → `Male`
- `female` → `Female`

If HALO uses a controlled list, convert extracted values to that standard.

### Folder Title

Auto-generate after extraction and update live if the user edits name, DOB, or gender.

---

## Technical Implementation Plan

### 1. Frontend: New Patient Folder Flow

Update the New Patient Folder component to support dual input modes:

- manual
- sticker scan

### 2. Frontend: Sticker Image Capture

Add image input handling:

- camera capture on mobile
- file upload fallback
- image preview optional

### 3. Frontend: Base64 Conversion

Convert selected image into base64 before sending to the extraction service.

### 4. Frontend: Notes/Functions API Call

Send a POST request to:

```text
${VITE_NOTES_API_URL}/extract_patient_sticker
```

with body:

```json
{
  "content": "<base64 image>",
  "contentType": "image"
}
```

The API doc confirms `/extract_patient_sticker` is a root-mounted endpoint under the functions base URL.

### 5. Frontend: Response Mapping

Map the returned fields to:

- patient name
- patient ID
- DOB
- gender
- folder title

### 6. Frontend: Review / Confirm Step

Show extracted values in editable inputs before create-folder submission.

### 7. Backend / Persistence

Ensure the final accepted values are used for actual folder creation and record initialization.

### 8. Error Handling

Add proper handling for:

- invalid image
- unreadable sticker
- timeout / upstream failure
- malformed response
- missing expected fields

---

## Recommended Response Handling Strategy

Because the current API doc only guarantees:

- `patient_name`
- `patient_id`

the frontend should use a tolerant parsing strategy such as:

- use `patient_name` if present
- use `patient_id` if present
- use `dob` if present
- use `gender` if present
- leave missing fields editable and blank if not returned

This avoids blocking the UX while keeping the feature compatible with future API upgrades.

---

## Validation Rules

Before folder creation, validate:

- patient name is present
- patient ID is present if HALO requires it
- DOB is in valid date format if provided
- gender matches accepted options if provided
- generated folder title is not empty

If extraction produces incomplete data, the user should still be able to fill in the missing pieces manually before saving.

---

## Suggested UI Copy

### Buttons

- **New Patient Folder**
- **Enter Details Manually**
- **Scan Patient Sticker**
- **Take Photo**
- **Upload Image**
- **Use Extracted Details**
- **Create Folder**

### Error copy

- “Could not read the patient sticker. Please retake the photo or enter the details manually.”
- “Some fields could not be extracted. Please review before creating the folder.”

### Helper text

- “Capture a clear photo of the patient sticker to auto-fill folder details.”

---

## Success Criteria

This feature is complete when:

1. user clicks **New Patient Folder**
2. user can choose **manual entry** or **scan patient sticker**
3. user can take a photo or upload a sticker image
4. sticker image is sent to `/extract_patient_sticker`
5. extracted patient fields populate the folder form
6. DOB and gender are supported when available
7. folder title is auto-generated using proper patient-folder naming
8. user can accept the details directly and create the folder without retyping
9. user can edit extracted values before submission
10. manual entry remains available as a fallback

---

## Non-Goal Clarification

This feature is not just an OCR preview utility.

It must be implemented as a **true folder-creation accelerator**, where extracted sticker details can become the accepted patient-folder details directly.

The scan flow must reduce friction, reduce typing, and support real clinical intake usage.

---

## Engineering Notes

- Use `VITE_NOTES_API_URL` on the frontend for direct browser calls to the functions service.
- Keep the API endpoint root-mounted with no extra prefix, as documented.
- Build the extraction parser so it can safely support future fields like DOB and gender.
- Keep route and field naming consistent with HALO’s existing patient model.
- Prefer mobile-friendly UX because camera capture is a primary use case here.

---

## Final Requirement Summary

Implement patient sticker scanning as part of **New Patient Folder** so the user can either type details manually or take/upload a sticker photo. The app must extract patient data from the sticker, pull date of birth and gender when available, generate the folder title using the correct patient-record naming convention, and allow the user to accept the extracted details directly as the folder data instead of re-entering everything manually.
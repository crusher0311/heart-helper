// addAInewAppointment.js

console.log("Injecting 'Add AI Concern' button for the appointment creation page");

// Function to inject the "Add AI Concern" button by modifying the label
function injectAppointmentButton() {
    const targetLabelSelector = "#root > div.flex.flex-col.h-screen > main > div > div > div.max-w-3xl.mx-auto.my-8.rounded-sm.shadow-sm.bg-shade-0 > div > form > div.space-y-3.p-6 > div:nth-child(2) > label";
    const targetLabel = document.querySelector(targetLabelSelector);

    if (targetLabel) {
        // Change label text to "Add AI Concern"
        targetLabel.textContent = "Add AI Concern";
        targetLabel.style.cursor = "pointer";
        targetLabel.style.color = "rgb(23, 134, 232)";
        targetLabel.style.fontWeight = "bold";
        targetLabel.style.textDecoration = "underline";

        // Add click functionality to open the side panel
        targetLabel.addEventListener("click", () => {
            console.log("Appointment 'Add AI Concern' label clicked - Requesting side panel open.");
            chrome.runtime.sendMessage({ action: "openSidePanel", source: "appointment" });
        });

        console.log("Appointment 'Add AI Concern' button injected as label.");
    } else {
        console.log("Target label for appointment 'Add AI Concern' not found; skipping injection.");
    }
}

// Run the injection only once on page load
window.addEventListener("load", injectAppointmentButton);

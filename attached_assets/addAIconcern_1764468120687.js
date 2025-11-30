console.log("Injecting the button next to Add Concern");

// Customization Settings
const buttonStyles = {
    backgroundColor: "rgb(23, 134, 232)",
    borderRadius: "8px",
    padding: "10px 20px",
    boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
    textColor: "white",
    fontWeight: "bold",
    border: "1px solid rgb(23, 134, 232)",
    textTransform: "uppercase",
    transition: "background-color 250ms ease, box-shadow 250ms ease"
};

function injectButton() {
    const targetButton = document.querySelector('[data-cy="add-customer-concern"]');

    if (targetButton) {
        const existingButton = document.querySelector("#aiConcernButtonWrapper");

        if (!existingButton) {
            const buttonWrapper = document.createElement("div");
            buttonWrapper.id = "aiConcernButtonWrapper";
            buttonWrapper.style.display = "inline-flex";
            buttonWrapper.style.alignItems = "center";

            targetButton.parentNode.insertBefore(buttonWrapper, targetButton);
            buttonWrapper.appendChild(targetButton);

            const newButton = document.createElement("button");
            newButton.id = "aiConcernButton";

            // Apply styles
            newButton.style.backgroundColor = buttonStyles.backgroundColor;
            newButton.style.borderRadius = buttonStyles.borderRadius;
            newButton.style.padding = buttonStyles.padding;
            newButton.style.boxShadow = buttonStyles.boxShadow;
            newButton.style.color = buttonStyles.textColor;
            newButton.style.fontWeight = buttonStyles.fontWeight;
            newButton.style.border = buttonStyles.border;
            newButton.style.textTransform = buttonStyles.textTransform;
            newButton.style.transition = buttonStyles.transition;
            newButton.style.cursor = "pointer";
            newButton.style.display = "inline-flex";
            newButton.style.alignItems = "center";
            newButton.style.marginLeft = "5px";

            const buttonText = document.createTextNode("ADD AI Concern");
            newButton.appendChild(buttonText);

            buttonWrapper.appendChild(newButton);

            // Event listener for opening the side panel and selecting the element
            newButton.addEventListener("click", () => {
                console.log("Requesting side panel open.");
                chrome.runtime.sendMessage({ action: "openSidePanel" });

                // Select the button with the specified selector
                const aiConcernSelector = document.querySelector("#aiConcernButtonWrapper > button.MuiButtonBase-root.MuiButton-root.MuiButton-text");
                if (aiConcernSelector) {
                    aiConcernSelector.click();
                    console.log("AI Concern Button selected.");
                } else {
                    console.error("AI Concern Button not found.");
                }

                // New Logic: Send a message to clear the form in the side panel
                chrome.runtime.sendMessage({ action: "clearFormInSidePanel" });

            });

            console.log("ADD AI Concern button injected.");
        }
    }
}

window.addEventListener('load', () => {
    injectButton();

    const observer = new MutationObserver(() => {
        injectButton();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});


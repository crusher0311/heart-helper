document.getElementById('submitConcernButton').addEventListener('click', () => {
    const concern = document.getElementById('concernInput').value;
    if (concern) {
        console.log("Customer concern submitted:", concern);
        // Further logic to handle submission
    } else {
        console.log("No concern entered.");
    }
});

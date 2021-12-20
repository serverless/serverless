'use strict';

module.exports = (changeSetDescription) => {
  const errorMessages = [
    'No updates are to be performed.',
    "The submitted information didn't contain changes.",
  ];

  return (
    changeSetDescription.Status === 'FAILED' &&
    errorMessages.some(
      (msg) => changeSetDescription.StatusReason && changeSetDescription.StatusReason.includes(msg)
    )
  );
};

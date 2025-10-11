/**
 * Example usage of Verification API from frontend
 * This is a reference implementation for the frontend team
 */

// Example 1: Submit Individual Verification
const submitIndividualVerification = async (formData) => {
  try {
    const form = new FormData();

    // Required fields for individual verification
    form.append("verificationType", "individual");
    form.append("contactNumber", formData.contactNumber); // e.g., "+971501234567"
    form.append("emiratesIdNumber", formData.emiratesIdNumber); // e.g., "784-1990-1234567-1"
    form.append("emiratesIdFront", formData.emiratesIdFrontFile); // File object
    form.append("emiratesIdBack", formData.emiratesIdBackFile); // File object

    const response = await fetch("/api/v1/verification/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        // Don't set Content-Type for FormData, let browser set it
      },
      body: form,
    });

    const result = await response.json();

    if (result.success) {
      console.log("Verification submitted successfully:", result.data);
      // Handle success (e.g., show success message, redirect to status page)
    } else {
      console.error("Verification submission failed:", result.message);
      // Handle error (e.g., show error message)
    }

    return result;
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// Example 2: Submit Business Verification
const submitBusinessVerification = async (formData) => {
  try {
    const form = new FormData();

    // Required fields for business verification
    form.append("verificationType", "business");
    form.append("contactNumber", formData.contactNumber);
    form.append("emiratesIdNumber", formData.emiratesIdNumber);
    form.append("businessLicenseNumber", formData.businessLicenseNumber);
    form.append("businessName", formData.businessName);
    form.append("emiratesIdFront", formData.emiratesIdFrontFile);
    form.append("emiratesIdBack", formData.emiratesIdBackFile);
    form.append("businessLicense", formData.businessLicenseFile);

    const response = await fetch("/api/v1/verification/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: form,
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Network error:", error);
    throw error;
  }
};

// Example 3: Get Verification Status
const getVerificationStatus = async () => {
  try {
    const response = await fetch("/api/v1/verification/status", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (result.success) {
      const { status, type, isVerified, canSubmit } = result.data;

      // Handle different statuses
      switch (status) {
        case "unverified":
          console.log("User has not submitted verification yet");
          // Show verification form
          break;
        case "pending":
          console.log("Verification is under review");
          // Show pending status message
          break;
        case "verified":
          console.log("User is verified");
          // Show verified badge/status
          break;
        case "rejected":
          console.log(
            "Verification was rejected:",
            result.data.rejectionReason
          );
          // Show rejection reason and allow resubmission
          break;
      }
    }

    return result;
  } catch (error) {
    console.error("Error fetching verification status:", error);
    throw error;
  }
};

// Example 4: Admin - Get Pending Verifications
const getPendingVerifications = async (page = 1, limit = 20) => {
  try {
    const response = await fetch(
      `/api/v1/verification/pending?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error fetching pending verifications:", error);
    throw error;
  }
};

// Example 5: Admin - Approve/Reject Verification
const reviewVerification = async (userId, action, rejectionReason = null) => {
  try {
    const response = await fetch(`/api/v1/verification/review/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action, // 'approve' or 'reject'
        rejectionReason, // required only when rejecting
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error reviewing verification:", error);
    throw error;
  }
};

// Example 6: Admin - Get Verification Details
const getVerificationDetails = async (userId) => {
  try {
    const response = await fetch(`/api/v1/verification/details/${userId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error fetching verification details:", error);
    throw error;
  }
};

// Example 7: Validation Helpers (you can implement these on frontend too)
const validateUAEPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return false;
  const cleanNumber = phoneNumber.replace(/[\s-]/g, "");
  const patterns = [/^\+971[0-9]{9}$/, /^971[0-9]{9}$/, /^0[0-9]{9}$/];
  return patterns.some((pattern) => pattern.test(cleanNumber));
};

const validateEmiratesId = (emiratesId) => {
  if (!emiratesId) return false;
  const cleanId = emiratesId.replace(/[\s-]/g, "");
  return /^784[0-9]{12}$/.test(cleanId);
};

// Example 8: File validation before upload
const validateFile = (file) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only image files are allowed");
  }

  if (file.size > maxSize) {
    throw new Error("File size must be less than 10MB");
  }

  return true;
};

// Example React component structure (pseudocode)
/*
const VerificationForm = () => {
  const [formData, setFormData] = useState({
    verificationType: 'individual',
    contactNumber: '',
    emiratesIdNumber: '',
    businessLicenseNumber: '',
    businessName: '',
    emiratesIdFront: null,
    emiratesIdBack: null,
    businessLicense: null
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Validate form data
      if (!validateUAEPhoneNumber(formData.contactNumber)) {
        throw new Error('Invalid UAE phone number');
      }
      
      if (!validateEmiratesId(formData.emiratesIdNumber)) {
        throw new Error('Invalid Emirates ID format');
      }
      
      // Validate files
      validateFile(formData.emiratesIdFront);
      validateFile(formData.emiratesIdBack);
      
      if (formData.verificationType === 'business') {
        validateFile(formData.businessLicense);
      }
      
      // Submit verification
      const result = formData.verificationType === 'individual' 
        ? await submitIndividualVerification(formData)
        : await submitBusinessVerification(formData);
      
      if (result.success) {
        // Handle success
        setSuccessMessage('Verification submitted successfully!');
      }
    } catch (error) {
      setErrorMessage(error.message);
    }
  };
  
  return (
    // JSX form structure here
  );
};
*/

export {
  submitIndividualVerification,
  submitBusinessVerification,
  getVerificationStatus,
  getPendingVerifications,
  reviewVerification,
  getVerificationDetails,
  validateUAEPhoneNumber,
  validateEmiratesId,
  validateFile,
};

import Garage from '../models/Garage.js';
import GarageService from '../models/GarageService.js';
import {uploadToCloudinary} from "../utils/cloudinaryUpload.js";

class GarageController {
  // Create a new garage
  async createGarage(req, res) {
    try {
      const garageData = { ...req.body, owner: req.user.id };

      // Generate slug if not provided
      if (!garageData.slug) {
        garageData.slug = garageData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      // Check if slug already exists
      const existingGarage = await Garage.findOne({ slug: garageData.slug });
      if (existingGarage) {
        garageData.slug = `${garageData.slug}-${Date.now()}`;
      }

      const garage = new Garage(garageData);
      await garage.save();

      res.status(201).json({
        success: true,
        message: 'Garage created successfully',
        data: garage
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error creating garage',
        error: error.message
      });
    }
  }

  // Get all garages with filters
  async getAllGarages(req, res) {
    try {
      const {
        page = 1,
        limit = 12,
        search,
        service,
        location,
        rating,
        sortBy = 'rating.average',
        sortOrder = -1,
        lat,
        lng,
        radius = 10000
      } = req.query;

      let query = { isActive: true };

      // Search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { specialties: { $in: [new RegExp(search, 'i')] } }
        ];
      }

      // Service filter
      if (service && service !== 'All Services') {
        query.specialties = { $in: [service] };
      }

      // Location filter
      if (location && location !== 'All Locations') {
        query.address = { $regex: location.replace(', Dubai', ''), $options: 'i' };
      }

      // Rating filter
      if (rating && rating !== 'All Ratings') {
        const minRating = parseFloat(rating.split('+')[0]);
        query['rating.average'] = { $gte: minRating };
      }

      // Geolocation filter
      if (lat && lng) {
        query.location = {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: parseInt(radius)
          }
        };
      }

      const garages = await Garage.find(query)
        .populate('owner', 'name email')
        .sort({ [sortBy]: parseInt(sortOrder) })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Garage.countDocuments(query);

      res.json({
        success: true,
        data: {
          garages,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching garages',
        error: error.message
      });
    }
  }

  // Get garage by slug
  async getGarageBySlug(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, isActive: true })
        .populate('owner', 'name email phone');

      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found'
        });
      }

      // Get garage services
      const services = await GarageService.find({ garage: garage._id, isActive: true })
        .sort({ 'rating.average': -1 });

      res.json({
        success: true,
        data: {
          garage,
          services
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching garage',
        error: error.message
      });
    }
  }

  // Update garage
  async updateGarage(req, res) {
    try {
      const { slug } = req.params;
      const updateData = { ...req.body };

      // Remove fields that shouldn't be updated directly
      delete updateData.owner;
      delete updateData.totalBookings;
      delete updateData.rating;

      const garage = await Garage.findOneAndUpdate(
        { slug, owner: req.user.id },
        updateData,
        { new: true, runValidators: true }
      );

      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      res.json({
        success: true,
        message: 'Garage updated successfully',
        data: garage
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error updating garage',
        error: error.message
      });
    }
  }

  // Upload garage images
  async uploadImages(req, res) {
    try {
      const { slug } = req.params;
      const { type } = req.body; // 'logo', 'coverImage', 'gallery'

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      const uploadPromises = req.files.map(file =>
        uploadToCloudinary(file.buffer, {
          folder: `garages/${garage._id}`,
          resource_type: 'image'
        })
      );

      const uploadResults = await Promise.all(uploadPromises);
      const imageUrls = uploadResults.map(result => result.secure_url);

      let updateData = {};
      if (type === 'logo') {
        updateData.logo = imageUrls[0];
      } else if (type === 'coverImage') {
        updateData.coverImage = imageUrls[0];
      } else if (type === 'gallery') {
        updateData.$push = { gallery: { $each: imageUrls } };
      }

      const updatedGarage = await Garage.findOneAndUpdate(
        { _id: garage._id },
        updateData,
        { new: true }
      );

      res.json({
        success: true,
        message: 'Images uploaded successfully',
        data: {
          urls: imageUrls,
          garage: updatedGarage
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error uploading images',
        error: error.message
      });
    }
  }

  // Get garage services
  async getGarageServices(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, isActive: true });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found'
        });
      }

      const services = await GarageService.find({ garage: garage._id, isActive: true })
        .sort({ 'rating.average': -1 });

      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching services',
        error: error.message
      });
    }
  }

  // Add service to garage
  async addService(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      const serviceData = { ...req.body, garage: garage._id };
      const service = new GarageService(serviceData);
      await service.save();

      res.status(201).json({
        success: true,
        message: 'Service added successfully',
        data: service
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error adding service',
        error: error.message
      });
    }
  }

  // Update service
  async updateService(req, res) {
    try {
      const { slug, serviceId } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      const service = await GarageService.findOneAndUpdate(
        { _id: serviceId, garage: garage._id },
        req.body,
        { new: true, runValidators: true }
      );

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        message: 'Service updated successfully',
        data: service
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error updating service',
        error: error.message
      });
    }
  }

  // Delete service
  async deleteService(req, res) {
    try {
      const { slug, serviceId } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      const service = await GarageService.findOneAndDelete({
        _id: serviceId,
        garage: garage._id
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.json({
        success: true,
        message: 'Service deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting service',
        error: error.message
      });
    }
  }

  // Get garage analytics/dashboard
  async getGarageDashboard(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: 'Garage not found or unauthorized'
        });
      }

      // Get services count and analytics
      const servicesCount = await GarageService.countDocuments({ garage: garage._id });
      const activeServicesCount = await GarageService.countDocuments({
        garage: garage._id,
        isActive: true
      });

      res.json({
        success: true,
        data: {
          garage,
          analytics: {
            totalServices: servicesCount,
            activeServices: activeServicesCount,
            totalBookings: garage.totalBookings,
            rating: garage.rating
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard data',
        error: error.message
      });
    }
  }

  // Get top rated garages
  async getTopRatedGarages(req, res) {
    try {
      const { limit = 6 } = req.query;

      const garages = await Garage.find({
        isActive: true,
        'rating.count': { $gte: 5 } // Only garages with at least 5 ratings
      })
        .sort({ 'rating.average': -1, 'rating.count': -1 })
        .limit(parseInt(limit))
        .select('name slug logo coverImage rating location address specialties trustBadges');

      res.json({
        success: true,
        data: garages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching top rated garages',
        error: error.message
      });
    }
  }

  // Search garages with autocomplete
  async searchGarages(req, res) {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.length < 2) {
        return res.json({
          success: true,
          data: []
        });
      }

      const garages = await Garage.find({
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { specialties: { $in: [new RegExp(q, 'i')] } },
          { address: { $regex: q, $options: 'i' } }
        ]
      })
        .select('name slug specialties address rating')
        .limit(parseInt(limit))
        .sort({ 'rating.average': -1 });

      res.json({
        success: true,
        data: garages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error searching garages',
        error: error.message
      });
    }
  }
}

export default new GarageController();

import Garage from "../models/Garage.js";
import GarageService from "../models/GarageService.js";
import {
  uploadToCloudinary,
  deleteResourceFromCloudinary,
} from "../utils/cloudinaryUpload.js";
import { Buffer } from "buffer";

class GarageController {
  async createGarage(req, res) {
    try {
      const { location, services = [], ...rest } = req.body;
      const geoLocation =
        location?.lat && location?.lng
          ? {
              type: "Point",
              coordinates: [location.lng, location.lat],
            }
          : undefined;

      let garageData = {
        ...rest,
        owner: req.user.id,
        location: geoLocation,
      };
      if (!garageData.slug || garageData.slug.trim() === "") {
        garageData.slug = garageData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
      const existingGarage = await Garage.findOne({ slug: garageData.slug });
      if (existingGarage) {
        garageData.slug = `${garageData.slug}-${Date.now()}`;
      }
      const garage = new Garage(garageData);
      await garage.save();
      let createdServices = [];
      if (services.length > 0) {
        createdServices = await Promise.all(
          services.map(async (service) => {
            const newService = new GarageService({
              ...service,
              garage: garage._id, // link service to garage
            });
            await newService.save();
            return newService;
          })
        );
        try {
          const serviceIds = createdServices.map((s) => s._id);
          if (!Array.isArray(garage.services)) garage.services = [];
          garage.services.push(...serviceIds);
          await garage.save();
        } catch (e) {
  }
}

      res.status(201).json({
        success: true,
        message: "Garage created successfully",
        data: {
          ...garage.toObject(),
          services: createdServices,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error creating garage",
        error: error.message, // short error message in response
      });
    }
  }
  async getAllGarages(req, res) {
    try {
      const {
        page = 1,
        limit = 12,
        search,
        service,
        location,
        rating,
        sortBy = "rating.average",
        sortOrder = -1,
        lat,
        lng,
        radius = 10000,
      } = req.query;

      let query = { isActive: true };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { specialties: { $in: [new RegExp(search, "i")] } },
        ];
      }
      if (service && service !== "All Services") {
        query.specialties = { $in: [service] };
      }
      if (location && location !== "All Locations") {
        query.address = {
          $regex: location.replace(", Dubai", ""),
          $options: "i",
        };
      }
      if (rating && rating !== "All Ratings") {
        const minRating = parseFloat(rating.split("+")[0]);
        query["rating.average"] = { $gte: minRating };
      }
      if (lat && lng) {
        query.location = {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            $maxDistance: parseInt(radius),
          },
        };
      }

      const garages = await Garage.find(query)
        .populate("owner", "name email")
        .populate("services")
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
            total,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching garages",
        error: error.message,
      });
    }
  }
  async getGarageBySlug(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, isActive: true }).populate(
        "owner",
        "name email phone"
      );

      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found",
        });
      }
      const services = await GarageService.find({
        garage: garage._id,
        isActive: true,
      }).sort({ "rating.average": -1 });

      res.json({
        success: true,
        data: {
          garage,
          services,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching garage",
        error: error.message,
      });
    }
  }
  async updateGarage(req, res) {
    try {
      const { slug } = req.params;
      const updateData = { ...req.body };
      const servicesPayload = Array.isArray(updateData.services)
        ? updateData.services
        : [];
      delete updateData.services;
      delete updateData.owner;
      delete updateData.totalBookings;
      delete updateData.rating;
      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }
      const updatedGarage = await Garage.findOneAndUpdate(
        { _id: garage._id },
        updateData,
        { new: true, runValidators: true }
      );
      const processedServices = [];
      for (const svc of servicesPayload) {
        const svcId = svc._id || svc.id || null;
        if (svcId) {
          const updatedService = await GarageService.findOneAndUpdate(
            { _id: svcId, garage: garage._id },
            { ...svc, garage: garage._id },
            { new: true, runValidators: true }
          );
          if (updatedService) processedServices.push(updatedService);
        } else {
          const newService = new GarageService({ ...svc, garage: garage._id });
          await newService.save();
          processedServices.push(newService);
          try {
            if (!Array.isArray(updatedGarage.services))
              updatedGarage.services = [];
            updatedGarage.services.push(newService._id);
            await updatedGarage.save();
          } catch (e) {
  }
}
      }
      const currentServices = await GarageService.find({
        garage: garage._id,
        isActive: true,
      }).sort({ "rating.average": -1 });

      res.json({
        success: true,
        message: "Garage updated successfully",
        data: { garage: updatedGarage, services: currentServices },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error updating garage",
        error: error.message,
      });
    }
  }
  async uploadImages(req, res) {
    try {
      const { slug } = req.params;
      const { type } = req.body; // 'logo', 'coverImage', 'gallery'

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }
      const normalizedFiles = req.files.map((file) => {
        const buf = file.buffer;
        if (!buf) return file;
        if (buf instanceof ArrayBuffer) {
          file.buffer = Buffer.from(buf);
        } else if (ArrayBuffer.isView(buf) && !(buf instanceof Buffer)) {
          file.buffer = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
        }
        return file;
      });
      const imageUrls = [];
      for (const file of normalizedFiles) {
        let attempt = 0;
        let uploaded = null;
        while (attempt < 2 && !uploaded) {
          try {
            attempt++;
            const res = await uploadToCloudinary(
              file,
              `garages/${garage._id}`,
              "image"
            );
            if (res && (res.url || res.secure_url)) {
              imageUrls.push(res.url || res.secure_url);
              uploaded = res;
            } else {
              throw new Error("Invalid upload response");
            }
          } catch (err) {
            if (attempt >= 2) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }

      let updateData = {};
      if (type === "logo") {
        updateData.logo = imageUrls[0];
      } else if (type === "coverImage") {
        updateData.coverImage = imageUrls[0];
      } else if (type === "gallery") {
        updateData.$push = { gallery: { $each: imageUrls } };
      }

      const updatedGarage = await Garage.findOneAndUpdate(
        { _id: garage._id },
        updateData,
        { new: true }
      );

      res.json({
        success: true,
        message: "Images uploaded successfully",
        data: {
          urls: imageUrls,
          garage: updatedGarage,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error uploading images",
        error: error.message,
      });
    }
  }
  async deleteImages(req, res) {
    try {
      const { slug } = req.params;
      const { type, urls = [], publicIds = [] } = req.body; // prefer publicIds if provided

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }

      if (
        (!urls || urls.length === 0) &&
        (!publicIds || publicIds.length === 0)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "No images specified to delete" });
      }
      const extractPublicIdFromUrl = (url) => {
        try {
          const u = new URL(url);
          const parts = u.pathname.split("/upload/");
          if (parts.length < 2) return null;
          let idWithExt = parts[1];
          idWithExt = idWithExt.replace(/^v\d+\//, "");
          idWithExt = idWithExt.replace(/\.[^/.]+$/, "");
          return idWithExt;
        } catch {
          return null;
        }
      };
      const idsToDelete = Array.from(publicIds || []);
      if (urls && urls.length > 0) {
        for (const u of urls) {
          const pid = extractPublicIdFromUrl(u);
          if (pid) idsToDelete.push(pid);
        }
      }

      if (idsToDelete.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Could not determine any publicIds to delete",
        });
      }
      let update = null;
      if (type === "logo") {
        update = { $unset: { logo: "" } };
      } else if (type === "coverImage") {
        update = { $unset: { coverImage: "" } };
      } else {
        if (urls && urls.length > 0) {
          update = { $pull: { gallery: { $in: urls } } };
        } else {
          update = {
            $pull: {
              gallery: { $in: idsToDelete.map((id) => new RegExp(id)) },
            },
          };
        }
      }
      const updatedGarage = await Garage.findOneAndUpdate(
        { _id: garage._id },
        update,
        { new: true }
      );

      const deletePromises = idsToDelete.map((pid) =>
        deleteResourceFromCloudinary(pid, "image")
      );
      const deleteResults = await Promise.all(deletePromises);

      res.json({
        success: true,
        message: "Images deleted",
        data: { garage: updatedGarage, deleted: idsToDelete, deleteResults },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting images",
        error: error.message,
      });
    }
  }
  async getGarageServices(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, isActive: true });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found",
        });
      }

      const services = await GarageService.find({
        garage: garage._id,
        isActive: true,
      }).sort({ "rating.average": -1 });

      res.json({
        success: true,
        data: services,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching services",
        error: error.message,
      });
    }
  }
  async addService(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }

      const serviceData = { ...req.body, garage: garage._id };
      const nameForSlug = (serviceData.name || "service").toString();
      const baseSlug = nameForSlug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      let uniqueSlug = baseSlug || "service";
      let suffix = 0;
      while (
        await GarageService.findOne({ garage: garage._id, slug: uniqueSlug })
      ) {
        suffix += 1;
        if (suffix > 20) {
          uniqueSlug = `${baseSlug}-${Date.now()}`;
          break;
        }
        uniqueSlug = `${baseSlug}-${suffix}`;
      }

      serviceData.slug = uniqueSlug;

      const service = new GarageService(serviceData);
      await service.save();
      try {
        if (!Array.isArray(garage.services)) garage.services = [];
        garage.services.push(service._id);
        await garage.save();
      } catch (e) {
  }
res.status(201).json({
        success: true,
        message: "Service added successfully",
        data: service,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error adding service",
        error: error.message,
      });
    }
  }
  async updateService(req, res) {
    try {
      const { slug, serviceId } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
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
          message: "Service not found",
        });
      }

      res.json({
        success: true,
        message: "Service updated successfully",
        data: service,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error updating service",
        error: error.message,
      });
    }
  }
  async getServiceBySlug(req, res) {
    try {
      const { garageSlug, serviceSlug } = req.params;
      const garage = await Garage.findOne({ slug: garageSlug, isActive: true });
      if (!garage) {
        return res
          .status(404)
          .json({ success: false, message: "Garage not found" });
      }

      const service = await GarageService.findOne({
        garage: garage._id,
        slug: serviceSlug,
        isActive: true,
      }).populate("garage", "name slug");

      if (!service) {
        return res
          .status(404)
          .json({ success: false, message: "Service not found" });
      }

      res.json({ success: true, data: service });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching service",
        error: error.message,
      });
    }
  }
  async deleteService(req, res) {
    try {
      const { slug, serviceId } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }

      const service = await GarageService.findOneAndDelete({
        _id: serviceId,
        garage: garage._id,
      });

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.json({
        success: true,
        message: "Service deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting service",
        error: error.message,
      });
    }
  }
  async getGarageDashboard(req, res) {
    try {
      const { slug } = req.params;

      const garage = await Garage.findOne({ slug, owner: req.user.id });
      if (!garage) {
        return res.status(404).json({
          success: false,
          message: "Garage not found or unauthorized",
        });
      }
      const servicesCount = await GarageService.countDocuments({
        garage: garage._id,
      });
      const activeServicesCount = await GarageService.countDocuments({
        garage: garage._id,
        isActive: true,
      });

      res.json({
        success: true,
        data: {
          garage,
          analytics: {
            totalServices: servicesCount,
            activeServices: activeServicesCount,
            totalBookings: garage.totalBookings,
            rating: garage.rating,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard data",
        error: error.message,
      });
    }
  }
  async getTopRatedGarages(req, res) {
    try {
      const { limit = 6 } = req.query;

      const garages = await Garage.find({
        isActive: true,
        "rating.count": { $gte: 5 }, // Only garages with at least 5 ratings
      })
        .sort({ "rating.average": -1, "rating.count": -1 })
        .limit(parseInt(limit))
        .select(
          "name slug logo coverImage rating location address specialties trustBadges"
        );

      res.json({
        success: true,
        data: garages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching top rated garages",
        error: error.message,
      });
    }
  }
  async searchGarages(req, res) {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.length < 2) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const garages = await Garage.find({
        isActive: true,
        $or: [
          { name: { $regex: q, $options: "i" } },
          { specialties: { $in: [new RegExp(q, "i")] } },
          { address: { $regex: q, $options: "i" } },
        ],
      })
        .select("name slug specialties address rating")
        .limit(parseInt(limit))
        .sort({ "rating.average": -1 });

      res.json({
        success: true,
        data: garages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error searching garages",
        error: error.message,
      });
    }
  }
}

export default new GarageController();

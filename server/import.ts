import { storage } from "./storage";
import type { Request, Response } from "express";

/**
 * Import a repair order from Tekmetric API format
 * This endpoint accepts the full Tekmetric repair order JSON
 * and stores it in the local database for searching
 */
export async function importRepairOrder(req: Request, res: Response) {
  try {
    const tekmetricData = req.body;

    if (!tekmetricData || !tekmetricData.id) {
      return res.status(400).json({ error: "Invalid repair order data" });
    }

    // Import vehicle if it doesn't exist
    const vehicleId = tekmetricData.vehicleId;
    if (vehicleId) {
      try {
        const existingVehicle = await storage.getVehicle(vehicleId);
        if (!existingVehicle) {
          // Vehicle data would need to come from a separate Tekmetric API call
          // For now, create a placeholder - user should import vehicles separately
          await storage.createVehicle({
            id: vehicleId,
            make: "Unknown",
            model: "Unknown",
            year: 2020,
            customerId: tekmetricData.customerId,
          });
        }
      } catch (err) {
        console.error("Error importing vehicle:", err);
      }
    }

    // Import repair order
    const repairOrder = {
      id: tekmetricData.id,
      repairOrderNumber: tekmetricData.repairOrderNumber,
      shopId: tekmetricData.shopId,
      vehicleId: tekmetricData.vehicleId,
      customerId: tekmetricData.customerId,
      technicianId: tekmetricData.technicianId,
      serviceWriterId: tekmetricData.serviceWriterId,
      status: tekmetricData.repairOrderStatus?.name || "Unknown",
      statusColor: tekmetricData.color,
      milesIn: tekmetricData.milesIn,
      milesOut: tekmetricData.milesOut,
      completedDate: tekmetricData.completedDate ? new Date(tekmetricData.completedDate) : null,
      postedDate: tekmetricData.postedDate ? new Date(tekmetricData.postedDate) : null,
      laborSales: tekmetricData.laborSales || 0,
      partsSales: tekmetricData.partsSales || 0,
      subletSales: tekmetricData.subletSales || 0,
      discountTotal: tekmetricData.discountTotal || 0,
      feeTotal: tekmetricData.feeTotal || 0,
      taxes: tekmetricData.taxes || 0,
      totalSales: tekmetricData.totalSales || 0,
    };

    await storage.createRepairOrder(repairOrder);

    // Import jobs
    const jobs = tekmetricData.jobs || [];
    for (const tekJob of jobs) {
      const job = {
        id: tekJob.id,
        repairOrderId: tekmetricData.id,
        vehicleId: tekmetricData.vehicleId,
        customerId: tekmetricData.customerId,
        name: tekJob.name,
        authorized: tekJob.authorized || false,
        authorizedDate: tekJob.authorizedDate ? new Date(tekJob.authorizedDate) : null,
        selected: tekJob.selected !== false,
        technicianId: tekJob.technicianId,
        note: tekJob.note,
        cannedJobId: tekJob.cannedJobId,
        jobCategoryName: tekJob.jobCategoryName,
        partsTotal: tekJob.partsTotal || 0,
        laborTotal: tekJob.laborTotal || 0,
        discountTotal: tekJob.discountTotal || 0,
        feeTotal: tekJob.feeTotal || 0,
        subtotal: tekJob.subtotal || 0,
        archived: tekJob.archived || false,
        createdDate: tekJob.createdDate ? new Date(tekJob.createdDate) : new Date(),
        completedDate: tekJob.completedDate ? new Date(tekJob.completedDate) : null,
        updatedDate: tekJob.updatedDate ? new Date(tekJob.updatedDate) : null,
        laborHours: tekJob.laborHours?.toString() || "0",
      };

      await storage.createJob(job);

      // Import labor items
      const laborItems = tekJob.labor || [];
      for (const tekLabor of laborItems) {
        await storage.createLaborItem({
          id: tekLabor.id,
          jobId: tekJob.id,
          name: tekLabor.name,
          rate: tekLabor.rate,
          hours: tekLabor.hours?.toString() || "0",
          complete: tekLabor.complete || false,
          technicianId: tekLabor.technicianId,
        });
      }

      // Import parts
      const parts = tekJob.parts || [];
      for (const tekPart of parts) {
        await storage.createPart({
          id: tekPart.id,
          jobId: tekJob.id,
          quantity: tekPart.quantity,
          brand: tekPart.brand,
          name: tekPart.name,
          partNumber: tekPart.partNumber,
          description: tekPart.description,
          cost: tekPart.cost,
          retail: tekPart.retail,
          partType: tekPart.partType?.name,
          partStatus: tekPart.partStatus?.name,
        });
      }
    }

    res.json({
      success: true,
      repairOrderId: tekmetricData.id,
      jobsImported: jobs.length,
    });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({
      error: "Failed to import repair order",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Import vehicle data from Tekmetric
 */
export async function importVehicle(req: Request, res: Response) {
  try {
    const tekVehicle = req.body;

    if (!tekVehicle || !tekVehicle.id) {
      return res.status(400).json({ error: "Invalid vehicle data" });
    }

    await storage.createVehicle({
      id: tekVehicle.id,
      make: tekVehicle.make || "Unknown",
      model: tekVehicle.model || "Unknown",
      year: tekVehicle.year || 2020,
      engine: tekVehicle.engine,
      vin: tekVehicle.vin,
      customerId: tekVehicle.customerId,
    });

    res.json({ success: true, vehicleId: tekVehicle.id });
  } catch (error) {
    console.error("Vehicle import error:", error);
    res.status(500).json({
      error: "Failed to import vehicle",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
